import { AgGridReact } from "ag-grid-react"
import {
    AllCommunityModule,
    GridApi,
    ModuleRegistry,
    ColDef,
} from "ag-grid-community"
import { forwardRef, useCallback, useContext, useEffect, useState } from "react"
import "@mantine/core/styles.css"
import "react-pdf/dist/esm/Page/TextLayer.css"
import {
    TemplateContext,
    resolveValuesAndOperations,
    TEMPLATE_MODE,
    MANUAL_MODE,
    isOperation,
} from "./pdfUtils"
import { Button, Menu, Stack, Text, TextInput } from "@mantine/core"

// Register all Community features
ModuleRegistry.registerModules([AllCommunityModule])

const templateHeaders: string[] = ["column 1", "column 2"]
// make headers

const columns: ColDef[] = templateHeaders.map((header) => {
    return {
        field: header,
        colId: header,
        cellRenderer: PDFObjectCell,
        cellEditor: PDFObjectCellEditor,
        autoHeight: true,
        wrapText: true,
        sortable: false,
        valueGetter: ({ data, column }) => data[column.getColDef().field ?? ""],
        // suppressKeyboardEvent: (params) => {
        //     console.log("cell is editing: " + params.editing)
        //     console.log("keyboard event:", params.event)

        //     // return true (to suppress) if editing and user hit up/down keys
        //     const key = params.event.key
        //     const gridShouldDoNothing =
        //         params.editing && (key === KEY_UP || key === KEY_DOWN)
        //     return gridShouldDoNothing
        // },
    }
})

// select row checkbox column -- TODO: formalize this, make it look less purgeable
columns.unshift({
    colId: "apply-template",
    cellRenderer: RowActionCell,
    pinned: "left",
    suppressNavigable: true,
})

const numActionColumns = 1

function renderValue(valueToRender, isTemplateMode, logging = false): string {
    if (logging) {
        console.log(valueToRender, isTemplateMode)
    }
    if (!valueToRender) {
        return ""
    }
    if (typeof valueToRender === "string") {
        return valueToRender
    }
    if (Array.isArray(valueToRender)) {
        return valueToRender
            .map((v) => renderValue(v, isTemplateMode))
            .join(" ")
    }
    if (valueToRender?.manual) {
        return valueToRender.str
    }
    // template object
    if (typeof valueToRender.str === "string") {
        return isTemplateMode ? `{{${valueToRender.index}}}` : valueToRender.str
    }
    //
    if (typeof valueToRender.symbol === "string") {
        return valueToRender.symbol
    }
    return valueToRender
}

function PDFObjectCell({ editingMode, node, value }) {
    const isTemplateMode = editingMode === TEMPLATE_MODE
    let finalRenderedValue = ""
    try {
        finalRenderedValue =
            value?.some?.(isOperation) &&
            resolveValuesAndOperations(value).join(" ")
    } catch (e) {
        console.warn("attempting to render uncalculable value", e)
    }
    if (value?.every((v) => v?.manual)) {
        return <Text>{renderValue(value, false)}</Text>
    }

    return (
        <Stack gap={0}>
            <Text>{renderValue(value, isTemplateMode)}</Text>
            {isTemplateMode && (
                <Text>
                    {renderValue(value, false)}
                    {finalRenderedValue && ` = ${finalRenderedValue}`}
                </Text>
            )}
        </Stack>
    )
}

function RowActionCell({
    setTemplateRow,
    deleteRow,
    node,
    data,
    api,
    copyRow,
    pasteRow,
}) {
    const enabled = api
        ?.getColumnDefs()
        .map((c) => c.field)
        .filter((f) => f && data[f])
        .some((f) => f)

    return (
        <Menu>
            <Menu.Target>
                <Button>Row Actions</Button>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    onClick={() => setTemplateRow(node.rowIndex)}
                    disabled={!enabled}
                >
                    <Text>Set as Template</Text>
                </Menu.Item>
                <Menu.Item onClick={() => deleteRow(node.rowIndex)}>
                    <Text c={"red"}>Delete Row</Text>
                </Menu.Item>
                <Menu.Item onClick={() => copyRow(node.rowIndex)}>
                    <Text>Copy Row</Text>
                </Menu.Item>
                <Menu.Item onClick={() => pasteRow(node.rowIndex)}>
                    <Text>Paste Row</Text>
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    )
}

const createManualEntryObject = (str) => ({
    str,
    manual: true,
})

function PDFObjectCellEditor({ value, onValueChange }) {
    const onChange2 = (e) => {
        onValueChange([createManualEntryObject(e.target.value)])
    }

    return <TextInput onChange={onChange2} />
}
type CSVGridProps = {
    editingMode: string
    processCellCallback: (params: any) => string
    setDataValue: (params: any) => void
    onCellClicked: (params: any) => void
    onGridReady: (params: any) => void
    highlightedRow: number | undefined
}

export const CSVGrid = forwardRef(
    (
        {
            editingMode,
            processCellCallback,
            setDataValue,
            onCellClicked,
            onGridReady,
            highlightedRow,
        }: CSVGridProps,
        ref,
    ) => {
        const {
            activeCell,
            setActiveCell,
            setTemplateRow,
            deleteRow,
            copyRow,
            pasteRow,
        } = useContext(TemplateContext)

        const [gridLoaded, setGridLoaded] = useState(false)

        const getRowStyle = useCallback(
            (params) => {
                if (params.node.rowIndex === highlightedRow) {
                    return { background: "#c8fff7ff" }
                }
            },
            [highlightedRow],
        )

        // TODO: too verbose event handler, would love to refactor and prevent bugs with this

        useEffect(() => {
            const api: GridApi = ref?.current?.api
            if (!api || !gridLoaded) {
                return
            }
            const onKeyDown = (e: Event) => {
                if (editingMode === MANUAL_MODE) {
                    return
                }
                const dataLength = api.getDisplayedRowCount()
                switch (e.key) {
                    case "ArrowLeft":
                        setActiveCell((oldCell) => {
                            const colIndex = columns.findIndex(
                                (c) => c.colId === oldCell.colId,
                            )
                            if (
                                colIndex === -1 ||
                                colIndex === 0 ||
                                colIndex === numActionColumns
                            ) {
                                return oldCell
                            }
                            return {
                                ...oldCell,
                                colId: columns[colIndex - 1].colId,
                            }
                        })
                        break
                    case "ArrowRight":
                        setActiveCell((oldCell) => {
                            const colIndex = columns.findIndex(
                                (c) => c.colId === oldCell.colId,
                            )
                            if (
                                colIndex === -1 ||
                                colIndex === columns.length - 1
                            ) {
                                return oldCell
                            }
                            return {
                                ...oldCell,
                                colId: columns[colIndex + 1].colId,
                            }
                        })
                        break
                    case "ArrowUp":
                        setActiveCell((oldCell) => {
                            if (oldCell.rowIndex === 0) {
                                return oldCell
                            }
                            return {
                                ...oldCell,
                                rowIndex: oldCell.rowIndex - 1,
                            }
                        })
                        break
                    case "ArrowDown":
                        setActiveCell((oldCell) => {
                            if (oldCell.rowIndex === dataLength - 1) {
                                return oldCell
                            }
                            return {
                                ...oldCell,
                                rowIndex: oldCell.rowIndex + 1,
                            }
                        })
                }
                e.stopImmediatePropagation()
            }

            document.addEventListener("keydown", onKeyDown)

            return () => document.removeEventListener("keydown", onKeyDown)
        }, [setActiveCell, ref, editingMode, gridLoaded])

        useEffect(() => {
            ref?.current?.api?.setFocusedCell(
                activeCell.rowIndex,
                activeCell.colId,
            )
        }, [ref, activeCell])

        return (
            <div style={{ height: "100%", width: "100%" }}>
                <AgGridReact
                    getRowId={
                        ({ api, ...params }) => {
                            console.log(params)
                            return api.getDisplayedRowAtIndex(params.data.id)
                                ?.id
                        }
                        // TODO: this seems fine but is it?
                    }
                    ref={ref}
                    animateRows={false}
                    suppressScrollOnNewData
                    defaultColDef={{
                        cellRendererParams: {
                            editingMode,
                            activeCell,
                            setTemplateRow,
                            deleteRow,
                            copyRow,
                            pasteRow,
                        },
                        cellEditorParams: {
                            editingMode,
                            activeCell,
                            setTemplateRow,
                        },
                        cellStyle: { textWrap: "wrap" },
                        editable: editingMode === MANUAL_MODE,
                    }}
                    defaultCsvExportParams={{
                        columnKeys: columns
                            .map((c) => c.colId)
                            .filter((k) => k !== "apply-template"),
                        processCellCallback,
                    }}
                    onCellEditingStopped={({ newValue, node, colDef }) => {
                        setDataValue({
                            rowIndex: node.rowIndex,
                            colId: colDef.colId!,
                            newValue,
                        })
                    }}
                    onCellClicked={onCellClicked}
                    onRowDataUpdated={(e) => console.log(e)}
                    columnDefs={columns}
                    getRowStyle={getRowStyle}
                    onGridReady={(params) => {
                        onGridReady(params)
                        setGridLoaded(true)
                        setActiveCell({
                            rowIndex: 0,
                            colId: columns[numActionColumns].colId,
                        })
                    }}
                />
            </div>
        )
    },
)
