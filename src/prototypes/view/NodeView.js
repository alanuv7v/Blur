//@ts-check
import appSession from "../../appSession"
import NodeModel from "../model/NodeModel"
import refs from "../../DOMRefs"
import parseQuery from "../../utils/parseQuery"

import van from "vanjs-core"
const {div, span, button, textarea, input, a} = van.tags

import autoResizedTextarea from "./autoResizedTextarea"

import * as userActions from "../../userActions"

import Tie from "../Tie"

export default class NodeView extends NodeModel {
    
    constructor (...data) {
        super(...data)
    }

    onDomMount = () => {
        this.updateStyle()
        Array.from(this.DOM.querySelectorAll(".autoResize"))?.forEach(d => d.autoResize())
    }

    selected = false
    opened = false
    filter = null
    openedFrom = null //NodeView that opened this node
    tie = ""
    linkedNodeViews = []
    
    deleteReady = false

    
    
    getAdress () {
        let originPath = this?.openedFrom?.path()
        if (originPath) return [...originPath, this.value]
        else return [this.value]
    }
    
    getAdressString () {
        return this.getAdress().join("/")
    }

    get isReference () {
        return this.value.startsWith(">")
    }

    get referenceQuery () {
        return this.value.slice(1)
    }
    
    get siblings () {
        return this.openedFrom.linkedNodeViews
    }

    get siblingsIndex () {
        let res
        for (let i = 0; i < this.siblings.length; i++) {
            let s = this.siblings[i]
            if (this.id === s.id) {
                res = i
                break
            }
        }
    }

    get linkIndex () {
        let res
        for (let i = 0; i < this.openedFrom.links.length; i++) {
            let l = this.openedFrom.links[i]
            if (this.tie === l[0] && this.id === l[1]) {
                res = i
                break
            }
        }
        return res
    }

    get path () {
        return [this.openedFrom ? [this.openedFrom.path, this.value] : this.value].flat().join("/")
    }

    get allSubNodes () {
        return this.linkedNodeViews.map(view => {
            if (view.linkedNodeViews.length > 0) {
                return [view, ...view.allSubNodes]
            } else {
                return view
            }
        }).flat()
    }

    getAllSubNodesStats (indent=0) {
        return this.allSubNodes.map(view => {
            let view_ ={...view}
            view_.linkedNodeViews = null //to prevent JSON stringfy error
            view_.openedFrom = null //to prevent JSON stringfy error
            return JSON.stringify(view_, null, indent)
        })
    }

    actionsDOM = div({class: "actions"},
        
        button({
            class: "linksOpener", 
            onclick: () => this.toggleOpen(),
            innerText: this.links.filter(link => link[0].split("/")[1] != "_origin").length,
            tooltip: "toggle show links"
        }),

        button({onclick: () => {
            this.deselect()
        }, tooltip: "deselect node"}, "*"/* "hide options */),
        button({onclick: () => {
            this.findNewOrigin()
        }, tooltip: "set new origin"}, "$"),
        button({onclick: async () => {
            this.showAuthContext(0)
        }, tooltip: "find full context"}, "^^"/* "show authName origin" */),
        button({onclick: async () => {
            this.showContext()
        }, tooltip: "find context"}, "^"/* "show origin" */),
        button({onclick: () => {
            let newNode = this.createBranch()
            this.open()
            this.linkedNodeViews.find(v => v.id === newNode.id)?.select()
        }, tooltip: "create new branch"}, "+" /* "new branch" */),
        /* button({onclick: () => {
            hearCommand((queryString) => {
                try {
                    let targetNodeId = parseQuery(queryString)[0].id
                    this.linkTo(this.tie, targetNodeId)
                    this.open()
                } catch (err) {
                    Logger.log(`failed to link "${queryString}"`, "error")
                }
            })
        }, tooltip: "create new link"}, "~"), */ //replaced by creating a link with value=">(queryString)"
        button({onclick: (e) => {
            console.log(this)
            if (this.deleteReady) {
                this.delete()
            } else {
                e.target.innerText = "confirm to delete!"
                this.deleteReady = true
            }
        }, onblur: (e) => {
            if (this.deleteReady) e.target.value = "delete"
        }, tooltip: "delete node"
        }, "X"/* "delete" */),
        //button("save metadata"),
        button({onclick: () => {
            if (this.opened) this.close() 
            else this.open()
        }, tooltip: "open/close"}, "<>"/* "open/close" */),
        button({onclick: () => {
            
            refs("CommandPalette").focus()
            refs("CommandPalette").placeholder = "filter..."
            
            let onArgumentsSubmit = async (event) => {
                    let actionResult = this.filter = event.target.value
                    console.log(actionResult)
                    refs("CommandPalette").placeholder = ""
                    refs("CommandPalette").removeEventListener("blur", onArgumentsSubmit)
                    this.close()
                    this.open()
                }
                
                refs("CommandPalette").addEventListener("blur", onArgumentsSubmit)
                
        }, tooltip: "filter links"}, "()"/* "filter" */),
        button({onclick: () => {userActions.Navigate.show_node_(`#${this.id}`)}, tooltip: "plant this node"}, "."/* "plant" */),
        button({
            onmousedown: () => {
                this.openTreeLoopCancelTrigger = false
                this.openTreeLoop(20, 5, () => this.openTreeLoopCancelTrigger)
            }, 
            onmouseup: () => {
                this.openTreeLoopCancelTrigger = true
            }
        }, "{")
    )
        
    delete () {
        this.DOM.remove()
        this.deleteRecord()
        this.openedFrom.refreshData()
        this.openedFrom.updateStyle()
        this.openedFrom.open()
        try {
            let prevSiblingsIndex = this.siblingsIndex
            this.openedFrom.linkedNodeViews.at(prevSiblingsIndex-1).select()
        } catch {
            this.openedFrom?.select()
        }
    }

    linksDOM = div({class: "links"})

    DOM = div({
        class: "node", 
        onmouseenter: (event) => this.#onHover(event),
        oncontextmenu: (event) => event.preventDefault(),
    },
        div({class: "overlay"},
        ),
        div({class: "main"},
            
            div({class: "selectionIndicator"}),
            
            div(
                
                input({class: "tieInput", placeholder: "from/to", 
                    
                    onclick: (event) => {
                        if (["planted", "/:reference"].includes(this.tie)) {
                            event.target.disabled = true
                        } else {
                            event.target.disabled = false
                        }
                        event.target.value = event.target.value.split(" ----- ").join("/")
                    },

                    onblur: (event) => {
                        event.target.value = event.target.value.split("/").join(" ----- ")
                    },

                    onchange: (event) => {
                    
                    let prevTie = structuredClone(this.tie)
                    this.tie = event.target.value

                    let [prevFrom, prevTo] = prevTie.split("/")

                    this.changeTie((new Tie(prevTie)).mirror, (new Tie(this.tie)).mirror, this.openedFrom.id)
                    
                    event.target.value = event.target.value.split("/").join(" ----- ")
                    this.showTieDefault()
                    
                }}),
                    
                autoResizedTextarea({
                    class: "value", 
                    value: this.value, 
                    onclick: (event) => this.#onclick(event), 
                    onauxclick: (event) => this.#onauxclick(event), 
                    onchange: (event) => {this.#onvaluechange(event)},
                    onfocus: () => this.select(),
                    onkeydown: (event) => this.#onkeydown(event),
                    onselect: (event) => this.#onselect(event),
                    onfocus: ((e) => {
                        e.preventDefault();
                        e.target.focus({preventScroll: true});
                        })
                }),

                div({class: "options"},
                    this.actionsDOM
                ),
                
            )
        ),
        this.linksDOM
    )

    async open (replacers=[], options={}) {

        const defaultOptions = {
            softAppear: false
        }

        options = {...defaultOptions, ...options}

        //clear DOM
        if (this.opened) this.close()

        if (this.isReference) {
            this.linkedNodeViews = parseQuery(this.referenceQuery)
        } else if (!this.links || this.links.length < 1) {
            // return if no links
            return
        } 

        //reset links DOM
        this.DOM.querySelector(".links").innerHTML = ""

        if (this.isReference) {
            console.log(await parseQuery(this.referenceQuery))
            this.linkedNodeViews = (await parseQuery(this.referenceQuery)).map(data => {
                let view = new NodeView(...data)
                view.openedFrom = this
                view.tie = "/:reference"
                return view
            })
        } else {
            //append linkedNodeViews to links DOM
            this.linkedNodeViews = this.links
                .map((link) => {
                    let tie = link[0]
                    let res = appSession.network.getNodeById(link[1])
                    if (tie && res) return {tie, data: res[0]}
                })
                .filter(link => link)
                .filter(link => link.data[0] != this.openedFrom?.id)
                .filter(link => link.data[0] != this.context)
                .filter(link => {
                    let tie = link.tie
                    let value = link.data[1]
                    //return value === this.filter || !this.filter
                    return tie === appSession.globalFilter || tie === this.filter || !this.filter
                })
                .map(({tie, data}) => {
                    return {
                        tie,
                        view: replacers?.find(r => r.id === data[0]) || new NodeView(...data)
                    }
                }).map(({tie, view}) => {
                    if (tie==="_origin/_value") view.originView = this
                    view.openedFrom = this
                    view.tie = tie
                    return view
                })
        }

        this.linkedNodeViews.forEach(view => {
            if (options.softAppear) {
                view.DOM.classList.add("appear")
            }
            this.DOM.querySelector(".links").append(view.DOM)
            view.onDomMount()
        })

        //set state
        this.opened = true

        this.updateStyle()

        return this.linkedNodeViews

    }

    close () {

        //empty DOM
        this.DOM.querySelector(".links").innerHTML = ""
        
        //set state
        this.opened = false
    }

    select () {

        console.log(this)

        //deselct the prev
        if (appSession.selectedNode) {
            appSession.selectedNode.deselect()
        }

        //style
        this.DOM.classList.add("selected")
        
        //set state
        this.selected = true
        appSession.selectedNode = this
        appSession.temp.lastNodeId = this.id
        
        //focus
        this.DOM.querySelector("textarea.value.input").focus()

        //show options
        this.showOptions()

        this.showTie()

    }

    deselect () {
        this.DOM.classList.remove("selected")
        appSession.selectedNode = null
        this.selected = false
        /* this.optionSleep = true */
        this.hideOptions()
        
        this.showTieDefault()
    }

    plant () {
        refs("Nodes").innerHTML = ""
        refs("Nodes").append(this.DOM)
        this.tie = "planted"
        this.onDomMount()
    }

    toggleOpen () {
        if (!this.opened) {
            this.open()
        } else {
            this.close()
        }
    }

    async showContext () {
        if (!this.context) return false
        let res = (await parseQuery(`#${this.context}`))
        let contextView = new NodeView(...res[0])
        
        contextView.plant()
        contextView.open([this])
        contextView.select()

        return contextView
    }

    async showAuthContext (i) {
        
        if (i >= 10/* max find */) {
            return false
        }

        let lastOrigin = await this.showContext()
        
        if (lastOrigin && !lastOrigin.isAuthname) {
            i++
            lastOrigin.showAuthContext(i)
        } else {
            return lastOrigin
        }

    }

    moveLinkIndex (toAdd) {
        if (toAdd === 0) return false
        let toSwapWith = this.siblings[this.siblingsIndex + toAdd]
        console.log(toSwapWith.value)
        let targetIndex = toSwapWith?.linkIndex
        if (!targetIndex || targetIndex < -1 || targetIndex > this.openedFrom.links.length) return false
        this.openedFrom.links.splice(this.linkIndex, 1) //delete pre-existing self
        this.openedFrom.links.splice(targetIndex, 0, [this.tie, this.id]) //insert self
        console.log(this.openedFrom.links)
        this.openedFrom.updateRecord()
    }

    moveUp () {
        //move perm data
        let res = this.moveLinkIndex(-1)
        //move temp data
        let prevSiblingsIndex = this.siblingsIndex
        this.openedFrom.linkedNodeViews.splice(prevSiblingsIndex, 1) //delete pre-existing self
        this.openedFrom.linkedNodeViews.splice(prevSiblingsIndex - 1, 0, this) //insert self
        //move DOM
        this.DOM.parentNode.insertBefore(this.DOM, this.DOM.previousSibling)
        this.select()
        return res
    }

    moveDown () {
        //move data
        let res = this.moveLinkIndex(1)
        //move temp data
        let prevSiblingsIndex = this.siblingsIndex
        this.openedFrom.linkedNodeViews.splice(prevSiblingsIndex, 1) //delete pre-existing self
        this.openedFrom.linkedNodeViews.splice(prevSiblingsIndex + 1, 0, this) //insert self
        //move DOM
        if (this.DOM.nextSibling.nextSibling) {
            this.DOM.parentNode.insertBefore(this.DOM, this.DOM.nextSibling.nextSibling) 
        } else {
            this.DOM.parentNode.insertBefore(this.DOM, null) //to the end
        }

        this.select()
        return res
    }

    findNewOrigin () {
        this.DOM.classList.add("finding-new-origin")
        appSession.onClickedNodeChange = (nodeView) => {
            this.reOrigin(nodeView.id, nodeView)
        }
        this.select()
    }

    reOrigin (newOriginId, newOriginView) {
        if (this.id === newOriginId) return false
        //move data
        let newModel = new NodeModel(newOriginId)
        newModel.refreshData()
        newModel.addLink(this.tie, this.id)
        this.openedFrom.links.splice(this.linkIndex, 1)
        this.openedFrom.updateRecord()
        //move temp data
        this.openedFrom.linkedNodeViews.splice(this.siblingsIndex, 1)
        this.openedFrom.open()
        //move DOM
        if (!newOriginView) return
        newOriginView.refreshData()
        newOriginView.open()
        //end finding new origin
        appSession.onClickedNodeChange = () => {}
        this.DOM.classList.remove("finding-new-origin")
        this.select()
    }

    createBranch (value) {
        if (this.isReference) return false
        return this.createLinkedNode ("context/", value || "")
    }

    showTie () {
        this.DOM.querySelector(".tieInput").style.display = "inline-block"
    }

    showTieDefault () {
        this.DOM.querySelector(".tieInput").style.display = this.tie === "context/" ? "none" : "inline-block"
    }

    updateStyle () {
        try {
            
            this.showTieDefault()
            this.DOM.querySelector(".tieInput").value = this.tie.split("/").join(" ----- ")
            
            if (this.isAuthname) {
                this.DOM.classList.add("authName")
            } else {
                this.DOM.classList.remove("authName")
            }
            
            if (this.isReference) {
                this.DOM.classList.add("reference")
            } else {
                this.DOM.classList.remove("reference")
            }

            this.DOM.querySelector(".linksOpener").innerText = this.links.filter(link => link[0].split("/")[1] != "context").length

        } catch (err) {
            console.error(err)
        }
    }
    
    #onclick () {
        this.toggleOptionsDisplay()
        if (!this.selected ) {
            this.select()
        }
        appSession.clickedNode = this
        /* if (this.optionSleep) {
            this.optionSleep = false
        } else {
            this.toggleOptionsDisplay()
        } */
    }

    optionSleep = false
    optionShown = false
    
    toggleOptionsDisplay () {
        //toggle the visibility of options
        if (this.optionShown) {
            this.hideOptions()
        } else {
            this.showOptions()
        }
    }

    showOptions () {
        this.DOM.classList.add("option-shown")
        this.optionShown = true
    }

    hideOptions () {
        this.DOM.classList.remove("option-shown")
        this.optionShown = false
    }

    #onauxclick (event) {
        event.preventDefault()
        event.stopPropagation()
        this.toggleOptionsDisplay()
    }
    
    #onvaluechange (event) {
        this.value = event.target.value
        if (this.isAuthname && this.authNameConflict) {
            console.log(this.DOM, event.target)
            this.DOM.classList.add("error")
            event.target.value += "  // this authentic name conflicts pre-existing nodedata record!"
            return false
        } 
        this.DOM.classList.remove("error")
        this.updateRecord()
        this.updateStyle()

    }

    #onHover (event) {
        appSession.hoveredNode = this
    }

    #onkeydown (event) {

        if (event.key === "Enter" && event.altKey) {
            
            event.preventDefault()
            try {
                this.openedFrom.createBranch()
                this.openedFrom.open()
                this.openedFrom.linkedNodeViews.slice(-1)[0]?.select()
            } catch {
                
            }
            
        } else if (event.key === "ArrowUp" && event.altKey && event.shiftKey) {

            this.moveUp()
            
        } else if (event.key === "ArrowDown" && event.altKey && event.shiftKey) {
            
            this.moveDown()

        } else if (event.key === "ArrowRight" && event.altKey && event.shiftKey) {
            
            let newNode = this.createBranch()
            this.open()
            this.linkedNodeViews.find(v => v.id === newNode.id)?.select()

        } else if (event.key === "Backspace" && event.target.value.length <= 0) {
            
            this.delete()
            event.preventDefault()
            
        } else if (event.key === "ArrowUp" && event.altKey) {

            this.siblings[this.siblingsIndex-1]?.select()
            
        } else if (event.key === "ArrowDown" && event.altKey) {
            
            this.siblings[this.siblingsIndex+1]?.select()

        } else if (event.key === "ArrowLeft" && event.altKey && event.ctrlKey) {
            
            event.preventDefault()
            if (!this.openedFrom) {
                this.showContext()
            }
            this.openedFrom?.select()

        } else if (event.key === "ArrowRight" && event.altKey && event.ctrlKey) {

            event.preventDefault()
            if (!this.opened) this.open()
            this.linkedNodeViews[0]?.select()
        } else if (event.key.startsWith("Arrow") && event.target.selectionStart === event.target.selectionEnd) { 
        
            let pos = event.target.selectionStart
            let lines = event.target.value.split("\n")
            let lastLineStart = lines.slice(0, -1).reduce((acc, l) => acc + l.length, 0) + (Math.max(lines.length - 1, 0) * "\n".length)

            let atTheTopLine = pos <= lines[0].length
            let atTheBottomLine = pos >= lastLineStart
            
            console.log(pos, lines, lastLineStart, atTheTopLine, atTheBottomLine)
            
            if (event.key === "ArrowUp" && atTheTopLine) {
                this?.siblings[this.siblingsIndex-1]?.select()
            }
            else if (event.key === "ArrowDown" && atTheBottomLine) {
                this?.siblings[this.siblingsIndex+1]?.select()
            }
        } 
            
    }

    #onselect (event) {
    }

    openTreeLoopCancelTrigger = false

    async openTreeLoop (maxOpenCount=20, maxDepths=5, isCanceled, options) {

        const defualtOptions = {
            siblingOpenDelay: 1000,
            depthOpenDelay: 1000
        }

        options = {...defualtOptions, ...options}
        
        if (!this.opened) await this.open(null, {softAppear: true})
        
        let lastDepth = this.linkedNodeViews
        let depthCount = 0
        let openCount = 0
        
        async function openDepthLoop () {
            
            async function openViews (views) {
                function timeout(ms) {
                    return new Promise(resolve => setTimeout(() => resolve(ms), ms));
                }
                for await (let view of views) {
                    if (isCanceled()) break
                    await timeout(view.open(null, {softAppear: true}))
                    await timeout(options.depthOpenDelay)
                    console.log(view.value)
                }
                return views
            }
            
            if (isCanceled()) return

            if (!lastDepth || lastDepth.length <= 0) {
                return
            }
            await openViews(lastDepth)
            let depthDown = lastDepth.map(v => v.linkedNodeViews).flat()
            
            openCount += lastDepth.length
            depthCount++
            
            if (depthCount > maxDepths || openCount > maxOpenCount) {
                return
            } else {
                lastDepth = depthDown
                openDepthLoop()
            }

            console.log({lastDepth, depthCount, maxDepths, openCount, maxOpenCount})
        }

        await openDepthLoop()

    }

    removeView () {
        this.openedFrom.linkedNodeViews.splice(this.siblingsIndex, 1) 
        this.DOM.remove()
    }

    lateFilter () {
        //필터가 뒤늦게 적용됬을때 DOM 지우고 this.linkedNodeViews에서 제거
        let noViews = []

        this.linkedNodeViews.forEach(view => {
            let okay = [this.filter, appSession.globalFilter].includes((new Tie(view.tie)).mirror)
            if (!okay) {
                noViews.push(view)
            }
        })

        noViews.forEach(view => 
            view.removeView()
        )

    }

    treeLateFilter (maxViews=50) {
        
        let viewCount = 0
        
        function loop (view) {
            view.lateFilter()
            for (const linkedView of view.linkedNodeViews) {
                if (viewCount > maxViews) break
                viewCount ++
                loop(linkedView)
            }
        }

        loop(this)

    }
}