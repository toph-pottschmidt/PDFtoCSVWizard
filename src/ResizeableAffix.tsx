import { useEffect, useRef, useState } from "react"
import { Affix, Button, CloseIcon, Group } from "@mantine/core"
import {
    useDisclosure,
    useMove,
    useResizeObserver,
    useViewportSize,
} from "@mantine/hooks"
import { Move } from "./MoveIcon"

export const ResizableAffix = ({ children }) => {
    const [resizeRef, rect] = useResizeObserver()
    const [positionValue, setValue] = useState({ x: 0, y: 0 })
    const { ref, active } = useMove(setValue)
    const parentRef = useRef(null)

    const dimensions = useViewportSize()

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

    const [fullscreen, { toggle }] = useDisclosure(false)

    const dimensionProps = fullscreen
        ? { width: dimensions.width, height: dimensions.height }
        : { width: 720, height: 500 }

    return (
        <>
            <Affix
                position={
                    fullscreen
                        ? { bottom: 0, right: 0 }
                        : { bottom: 20, right: 20 }
                }
                ref={parentRef}
                style={{
                    boxShadow: "-2px 2px 5px gray",
                    padding: "5px",
                    backgroundColor: "white",
                    ...dimensionProps,
                }}
            >
                <Group w={"100%"} align="flex-end" justify="flex-end" p={"xs"}>
                    <Button
                        onClick={toggle}
                        style={{}}
                        size="xs"
                        variant="outline"
                        title={fullscreen ? "Exit Fullscreen" : "Full Screen"}
                    >
                        {fullscreen ? <CloseIcon /> : <Move />}
                    </Button>
                </Group>
                <div
                    ref={resizeRef}
                    style={{
                        width: dimensionProps.width - 10,
                        height: dimensionProps.height - 10 - 220,
                    }}
                >
                    {children}
                </div>
            </Affix>
        </>
    )
}
