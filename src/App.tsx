import "./App.css"
import {
    Button,
    Group,
    Title,
    Checkbox,
    SegmentedControl,
    NumberInput,
} from "@mantine/core"
import { GridApi } from "ag-grid-community"
import { RefObject, useCallback, useEffect, useRef, useState } from "react"
import "@mantine/core/styles.css"
import "react-pdf/dist/esm/Page/TextLayer.css"
import {
    generateDataFromTemplate,
    TemplateContext,
    resolveValuesAndOperations,
    defaultActiveCell,
    isOperation,
    OPERATIONS,
    MANUAL_MODE,
    TEMPLATE_MODE,
    getFirstTemplateValue,
} from "./pdfUtils"
import type { ActiveCell, Operation } from "./pdfUtils"
import { CSVGrid } from "./CSVTable"
import { ResizableAffix } from "./ResizeableAffix"
import { ExportCSVButton } from "./ExportCSVButton"
import { readLocalStorageValue, useLocalStorage } from "@mantine/hooks"
import { PDFViewer } from "./PDFViewer"

const VERSION = "0.1.0"

window.r = resolveValuesAndOperations

const CSV_DATA_STORAGE_KEY = "PdfToCsvWizard_WorkingData"
const METADATA_STORAGE_KEY = "PdfToCsvWizard_Metadata"

const startData = [{}]

function App() {
    // local storage values and callbacks
    const [savedData, setSavedData] = useLocalStorage({
        key: CSV_DATA_STORAGE_KEY,
        defaultValue: startData,
    })
    const [workingMetadata, setWorkingMetadata] = useLocalStorage({
        key: METADATA_STORAGE_KEY,
        defaultValue: {},
    })
    const setMetadataValue = (property: string, value: any) => {
        setWorkingMetadata((prev) => ({
            ...prev,
            [property]: value,
        }))
    }

    const [loaded, setLoaded] = useState<boolean>(false)
    const [data, setData] = useState<Array<object>>(savedData)
    const [currentPageTextData, setCurrentPageTextData] = useState([])

    const [activeCell, setActiveCell] = useState<ActiveCell>(defaultActiveCell)

    const [templateRow, setTemplateRow] = useState<number>(-1)
    const [templateOffset, setTemplateOffset] = useState<number>(-1)

    // Create a gridRef
    const gridRef = useRef<RefObject<GridApi>>(null)
    // function to update all rows with value
    const [updateAll, setUpdateAll] = useState(false)
    const [editingMode, setEditingMode] = useState(TEMPLATE_MODE)

    const [defaultRowValue, setDefaultRowValue] = useState<
        Record<string, object>
    >({})

    const [selectedRow, setSelectedRow] = useState<number>(-1)
    const [copiedRow, setCopiedRow] = useState<Array<object> | undefined>()

    const currentCellValue = data[activeCell.rowIndex][activeCell.colId] ?? []
    // auto-save
    useEffect(() => {
        const intervalId = setInterval(() => {
            console.log("Starting save")
            setData((oldData) => {
                // TOOD
                setSavedData(oldData)
                return oldData
            })
            console.log("Finished Saving!")
        }, 30 * 1000)

        return () => clearInterval(intervalId)
    }, [])

    useEffect(() => {
        const data = readLocalStorageValue({ key: CSV_DATA_STORAGE_KEY })
        if (data) {
            setData(data)
        }
        const metadata = readLocalStorageValue({ key: METADATA_STORAGE_KEY })
        if (metadata?.defaultRowValue) {
            setDefaultRowValue(metadata.defaultRowValue)
        }
        setLoaded(true)
    }, [])

    const editData = ({ rowIndex, colId, newValue }) => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }

        // TODO: is this pure? idk.
        if (updateAll) {
            // set each data row value by column id to the new value
            setDefaultRowValue((old) => {
                const newDefault = { ...old, [colId]: newValue }
                setMetadataValue("defaultRowValue", newDefault)
                return newDefault
            })
            setData((oldData) =>
                oldData.map((d) => {
                    d[colId] = newValue
                    return d
                })
            )
            return
        }
        setData((oldData) => {
            const oldValue = oldData[rowIndex]
            const newData = [...oldData]
            newData.splice(rowIndex, 1, { ...oldValue, [colId]: newValue })
            return newData
        })
    }

    const appendOperationToCurrentCell = (newValue: Operation) => {
        if (!currentCellValue) {
            return
        }
        const finalNewValue = [...currentCellValue, { symbol: newValue.symbol }]
        setData((oldData) => {
            const newData = [...oldData]
            const oldRow = oldData[activeCell.rowIndex]
            const newRow = {
                ...oldRow,
                [activeCell.colId]: finalNewValue,
            }
            newData.splice(activeCell.rowIndex, 1, newRow)
            return newData
        })
    }

    const processCellCallback = ({ value, ...rest }) => {
        console.log(value, rest)
        if (typeof value === "string") {
            return value
        }

        return resolveValuesAndOperations(value).join(" ")
    }

    const onTextObjectClick = async (wordObj) => {
        const api: GridApi = gridRef?.current?.api
        if (!api || !wordObj) {
            return
        }

        const newValue = [...currentCellValue, wordObj]

        editData({ ...activeCell, newValue })
    }

    const applyTemplateToRowIndex = (rowIndex) => {
        // selectedTemplate
        // { key: obj }
        const result = generateDataFromTemplate({
            template: data[templateRow],
            templateRowIndex: templateRow,
            rowIndex,
            data,
            currentTextObjects: currentPageTextData,
            templateOffset,
        })
        if (!result) {
            return
        }

        const { data: newData, offsetUsed } = result
        setTemplateOffset(offsetUsed)
        setData(newData)
    }

    const applyTemplateToActiveRow = () =>
        applyTemplateToRowIndex(activeCell.rowIndex)

    const addNewRow = () => setData((old) => [...old, defaultRowValue])

    const operationsEnabled =
        currentCellValue.length &&
        !isOperation(currentCellValue[currentCellValue.length - 1])

    const clearCellData = () => {
        editData({ ...activeCell, newValue: [] })
    }

    const copyRow = (row) => {
        setCopiedRow(data[row])
    }

    // to be used for "pasting" a template to a new row in cases like new pdf page
    // and auto-index-offset will fail
    const pasteRow = (row) => {
        const dataToInject = copiedRow
        console.log(dataToInject)
        if (!dataToInject) {
            return
        }
        // new template will likely have new text values, optimistically update them
        const newRow: Record<string, object> = {}
        Object.entries(dataToInject).forEach(([field, value]) => {
            newRow[field] = value?.map?.((v) => {
                if (v.manual) {
                    return { ...v }
                }
                return {
                    ...v,
                    str: currentPageTextData.find(
                        (obj) => obj?.index === v.index
                    )?.str,
                }
            })
        })
        setData((old) => {
            const newData = [...old]
            newData.splice(row, 1, newRow)
            return newData
        })
        setTemplateRow(row)
    }

    const addNewTemplatedRow = () => {
        addNewRow()
        setActiveCell((old) => ({
            ...old,
            rowIndex: old.rowIndex + 1,
        }))
        applyTemplateToRowIndex(activeCell.rowIndex + 1)
    }

    const adjustRowTemplateIndex = (rowIndex, value) => {
        const currentTemplate = data[rowIndex]
        const baseIndex = getFirstTemplateValue(currentTemplate)?.index
        // const baseIndex = values[0]?.[0]?.index
        const offset = value - baseIndex
        console.log(baseIndex, offset)
        const newTemplateValue: Record<string, object> = {}
        for (const [key, value] of Object.entries(currentTemplate)) {
            const newValue = value.map((v) => {
                if (v.manual) {
                    return v
                }
                return {
                    ...v,
                    index: v?.index + offset,
                    str: currentPageTextData[v.index + offset]?.str,
                }
            })
            newTemplateValue[key] = newValue
        }

        setData((old) => {
            const newData = [...old]
            newData.splice(templateRow, 1, newTemplateValue)
            return newData
        })
    }

    const onRowSelected = (e) => {
        if (!e.event?.target) {
            return
        }
        if (e.rowIndex === selectedRow && !e.event.target.checked) {
            setSelectedRow(-1)
        } else if (e.event.target.checked) {
            setSelectedRow(e.rowIndex)
        }
    }

    const onCellClicked = ({ node, colDef }) =>
        setActiveCell({
            colId: colDef.colId!,
            rowIndex: node.rowIndex!,
        })

    const deleteRow = useCallback((row: number) => {
        setData((oldData) => {
            const newData = [...oldData]
            newData.splice(row, 1)
            return newData
        })
        setActiveCell((old) => ({ ...old, rowIndex: 0 }))
    }, [])

    const resetData = () => setData([{}])

    return (
        <>
            <Title>PDF Parsing Utility - {VERSION}</Title>
            <PDFViewer
                onTextClick={onTextObjectClick}
                onPageLoad={setCurrentPageTextData}
            />
            <TemplateContext.Provider
                value={{
                    activeCell,
                    setActiveCell,
                    templateRow,
                    setTemplateRow,
                    deleteRow,
                    copyRow,
                    pasteRow,
                }}
            >
                <ResizableAffix>
                    <Group wrap="nowrap">
                        {editingMode === MANUAL_MODE && (
                            <Checkbox
                                checked={updateAll}
                                onChange={(e) => setUpdateAll(e.target.checked)}
                                label="Update all rows?"
                            />
                        )}
                        <SegmentedControl
                            m={"sm"}
                            value={editingMode}
                            data={[MANUAL_MODE, TEMPLATE_MODE]}
                            onChange={setEditingMode}
                        />
                        {Object.values(OPERATIONS).map((o) => (
                            <Button
                                key={o.symbol}
                                onClick={() => appendOperationToCurrentCell(o)}
                                disabled={!operationsEnabled}
                            >
                                {o.symbol}
                            </Button>
                        ))}
                    </Group>
                    <Group gap={"sm"} p={"sm"}>
                        <Button onClick={addNewRow}>Add Row</Button>
                        <Button onClick={clearCellData}>Clear Cell</Button>
                        <Button
                            disabled={templateOffset === -1}
                            onClick={addNewTemplatedRow}
                        >
                            Add new templated row
                        </Button>
                        <Button
                            onClick={() => applyTemplateToActiveRow()}
                            disabled={
                                templateRow === activeCell.rowIndex ||
                                templateRow == -1
                            }
                        >
                            Apply Template
                        </Button>
                        <ExportCSVButton api={gridRef.current?.api} />
                        <NumberInput
                            value={
                                getFirstTemplateValue(data[templateRow])?.index
                            }
                            disabled={
                                getFirstTemplateValue(data[templateRow])
                                    ?.index === undefined ||
                                editingMode === MANUAL_MODE
                            }
                            description={"Template offset control"}
                            min={0}
                            max={currentPageTextData.length - 1}
                            onChange={(e) =>
                                adjustRowTemplateIndex(templateRow, e)
                            }
                        />
                        <Button variant="outline" onClick={resetData} c={"red"}>
                            Reset Grid Data
                        </Button>
                    </Group>
                    {loaded && (
                        <CSVGrid
                            ref={gridRef}
                            data={data}
                            editingMode={editingMode}
                            setDataValue={editData}
                            onRowSelected={onRowSelected}
                            onCellClicked={onCellClicked}
                            processCellCallback={processCellCallback}
                        ></CSVGrid>
                    )}
                </ResizableAffix>
            </TemplateContext.Provider>
            {/* </Group> */}
        </>
    )
}

export default App
