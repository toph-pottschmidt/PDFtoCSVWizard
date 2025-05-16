import { useEffect, useRef, useState } from "react"
import { Affix } from "@mantine/core"
import { useMove, useResizeObserver } from "@mantine/hooks"
import { Move } from "./MoveIcon"

export const ResizableAffix = ({ children }) => {
    const [resizeRef, rect] = useResizeObserver()
    const [positionValue, setValue] = useState({ x: 0, y: 0 })
    const { ref, active } = useMove(setValue)
    const parentRef = useRef(null)

    console.log("REF", ref)

    useEffect(() => {
        const el = ref.current
        if (!el) {
            return
        }
        let x, y
        const onMouseDown = (e) => {
            console.log("onMouseDown", e)
            console.log(parentRef.current?.getBoundingClientRect?.())
            x = e.screenX
            y = e.screenY
            e.stopPropagation()
        }
        const onMouseUp = (e) => {
            console.log("onMouseDown", e, x, y)
        }
        el.addEventListener("mouseup", onMouseUp)
        el.addEventListener("mousedown", onMouseDown)
        return () => {
            el.removeEventListener("mouseup", onMouseUp)
            el.removeEventListener("mousedown", onMouseDown)
        }
    }, [ref.current])

    return (
        <>
            <Affix
                position={{ bottom: 20, right: 20 }}
                ref={parentRef}
                style={{ boxShadow: "-2px 2px 5px gray", padding: "5px" }}
            >
                <div ref={resizeRef} style={{ height: 500, width: 720 }}>
                    {children}
                </div>
            </Affix>
        </>
    )
}
