import { AgGridReact } from "ag-grid-react"
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { forwardRef, useContext, useEffect, useMemo, useState } from "react"
import "@mantine/core/styles.css"
import "react-pdf/dist/esm/Page/TextLayer.css"
import {
    TemplateContext,
    resolveValuesAndOperations,
    TEMPLATE_MODE,
    MANUAL_MODE,
    isOperation,
} from "./pdfUtils"
import { Button, Stack, Text, TextInput } from "@mantine/core"
import { ResizableAffix } from "./ResizeableAffix"

// Register all Community features
ModuleRegistry.registerModules([AllCommunityModule])

const templateHeaders = [
    // "state",
    // "county",
    // "precinct",
    // "registered_voters",
    // "total_votes", // Total votes cast in the precinct
    // "candidate_a_votes", // Votes for the Republican candidate
    // "candidate_b_votes", // Votes for the Democrat candidate
    // "turnout_pct", //  Turnout percentage (total_votes/registered_voters)
    // "candidate_a_pct", // Percentage of votes for Republican candidate
    // "candidate_b_pct", // Percentage of votes for Democrat candidate
    // "democrat_registrations",
    // "republican_registrations",
    // "other_registrations",
    "State",
    "County",
    "Precinct",
    "republican_registrations",
    "democrat_registrations",
    "registered_voters",
    "republican_votes_total",
    "democrat_votes_total",
    "total_votes_overall",
    "total_votes_election_day",
    "total_votes_early",
    "total_votes_absentee",
    "democrat_votes_election_day",
    "democrat_votes_early",
    "democrat_votes_absentee",
    "republican_votes_election_day",
    "republican_votes_early",
    "republican_votes_absentee",
    "overall_turnout",
]
// make headers

const columns = templateHeaders.map((header) => {
    return {
        field: header,
        colId: header,
        cellRenderer: PDFObjectCell,
        cellEditor: PDFObjectCellEditor,
        autoHeight: true,
        wrapText: true,
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

columns.unshift({
    colId: "apply-template",
    cellRenderer: SetSelectedTemplateCell,
    pinned: "left",
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

function PDFObjectCell({ editingMode, activeCell, node, value, colDef }) {
    const isActiveCell =
        activeCell.rowIndex === node.rowIndex &&
        activeCell.colId === colDef.colId
    const isTemplateMode = editingMode === TEMPLATE_MODE
    let finalRenderedValue = ""
    try {
        finalRenderedValue =
            value?.some?.(isOperation) &&
            resolveValuesAndOperations(value).join(" ")
    } catch (e) {
        console.warn("attempting to render uncalculable value", e)
    }
    if (value?.manual) {
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

function SetSelectedTemplateCell({
    setTemplateRow,
    node,
    value,
    colDef,
    activeCell,
    data,
    api,
}) {
    console.log(data)
    const enabled = api
        ?.getColumnDefs()
        .map((c) => c.field)
        .some((f) => (f ? data[f] !== undefined : true))

    return (
        <Button
            onClick={() => setTemplateRow(node.rowIndex)}
            disabled={!enabled}
        >
            {"Set as template"}
        </Button>
    )
}

const createManualEntryObject = (str) => ({
    str,
    manual: true,
})

function PDFObjectCellEditor({ value, onValueChange }) {
    const onChange = ({ target: { value: newValue } }) => {
        // attempt to grab the most recent object
        const preChangeValue = value ?? []
        const mostRecentValue = preChangeValue?.[preChangeValue?.length - 1]

        // if it's already a manual entry, change the value on the object
        if (mostRecentValue?.manual) {
            mostRecentValue.originalStr ??= mostRecentValue.str
            mostRecentValue.str += newValue
        }
        const valueToSubmit = mostRecentValue?.manual
            ? preChangeValue
            : [...preChangeValue, createManualEntryObject(newValue)]
        console.log(mostRecentValue, valueToSubmit)
        onValueChange(valueToSubmit)
    }

    const onChange2 = (e) => {
        onValueChange([createManualEntryObject(e.target.value)])
    }

    return <TextInput onChange={onChange2} />
}

// Component meant to house settings and
export const CSVGrid = forwardRef(
    ({ data, editingMode, processCellCallback, children }, ref) => {
        const { activeCell, setActiveCell, setTemplateRow } =
            useContext(TemplateContext)

        // TODO: too verbose event handler, would love to refactor and prevent bugs with this

        useEffect(() => {
            const onKeyDown = (e: Event) => {
                switch (e.key) {
                    case "a":
                    case "ArrowLeft":
                        setActiveCell((oldCell) => {
                            const colIndex = columns.findIndex(
                                (c) => c.colId === oldCell.colId
                            )
                            if (
                                colIndex === -1 ||
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
                    case "d":
                    case "ArrowRight":
                        setActiveCell((oldCell) => {
                            const colIndex = columns.findIndex(
                                (c) => c.colId === oldCell.colId
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
                    case "w":
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
                    case "s":
                    case "ArrowDown":
                        setActiveCell((oldCell) => {
                            if (oldCell.rowIndex === data.length - 1) {
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
        }, [setActiveCell, data])

        useEffect(() => {
            ref?.current?.api?.setFocusedCell(
                activeCell.rowIndex,
                activeCell.colId
            )
        }, [ref, activeCell])

        return (
            <ResizableAffix>
                {children}
                <AgGridReact
                    rowHeight={editingMode === TEMPLATE_MODE ? 72 : 42}
                    ref={ref}
                    defaultColDef={{
                        cellRendererParams: {
                            editingMode,
                            activeCell,
                            setTemplateRow,
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
                    onCellEditingStopped={(props) => {
                        const { newValue, oldValue, node, column } = props
                        console.log(props)
                        if (typeof newValue !== "string") {
                            return
                        }
                        node.setDataValue(column, [
                            ...oldValue,
                            { str: newValue, manual: true },
                        ])
                    }}
                    onRowDataUpdated={(e) => console.log(e)}
                    rowData={data}
                    columnDefs={columns}
                    onGridReady={(e) => {
                        setActiveCell({
                            rowIndex: 0,
                            colId: columns[numActionColumns].colId,
                        })
                    }}
                />
            </ResizableAffix>
        )
    }
)
