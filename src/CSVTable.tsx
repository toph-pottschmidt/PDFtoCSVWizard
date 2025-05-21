import { AgGridReact } from "ag-grid-react"
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community"
import { forwardRef, useContext, useEffect, useMemo } from "react"
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

function SetSelectedTemplateCell({ setTemplateRow, node, data, api }) {
    const enabled = api
        ?.getColumnDefs()
        .map((c) => c.field)
        .filter((f) => f && data[f])
        .some((f) => f)

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
    (
        {
            data,
            editingMode,
            processCellCallback,
            children,
            setDataValue,
            onRowSelected,
            onCellClicked,
        },
        ref
    ) => {
        const { activeCell, setActiveCell, setTemplateRow } =
            useContext(TemplateContext)

        const modeData = useMemo(() => data, [])
        useEffect(() => {
            ref?.current?.api?.setGridOption("rowData", data)
        }, [data])

        // TODO: too verbose event handler, would love to refactor and prevent bugs with this

        useEffect(() => {
            const onKeyDown = (e: Event) => {
                if (editingMode === MANUAL_MODE) {
                    return
                }
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
        }, [setActiveCell, data, editingMode])

        useEffect(() => {
            ref?.current?.api?.setFocusedCell(
                activeCell.rowIndex,
                activeCell.colId
            )
        }, [ref, activeCell])

        return (
            <>
                <AgGridReact
                    ref={ref}
                    animateRows={false}
                    onRowSelected={onRowSelected}
                    rowSelection={{ mode: "singleRow" }}
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
                    onCellEditingStopped={({ newValue, node, colDef }) => {
                        setDataValue({
                            rowIndex: node.rowIndex,
                            colId: colDef.colId!,
                            newValue,
                        })
                    }}
                    onCellClicked={onCellClicked}
                    onRowDataUpdated={(e) => console.log(e)}
                    rowData={modeData}
                    columnDefs={columns}
                    onGridReady={() => {
                        setActiveCell({
                            rowIndex: 0,
                            colId: columns[numActionColumns].colId,
                        })
                    }}
                />
            </>
        )
    }
)
