import "./App.css"
import {
    Button,
    Group,
    Title,
    Checkbox,
    SegmentedControl,
    NumberInput,
} from "@mantine/core"
import { ColDef, GridApi, IRowNode, RowNode } from "ag-grid-community"
import {
    RefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
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
    const [gridReady, setGridReady] = useState(false)
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

    // auto-save
    useEffect(() => {
        const intervalId = setInterval(() => {
            console.log("Starting save")
            const api: GridApi = gridRef?.current?.api
            if (!api) {
                return
            }
            const allData = []
            api.forEachNode((rowNode) => allData.push(rowNode.data))

            setSavedData(allData)
            console.log("Finished Saving!")
        }, 30 * 1000)

        return () => clearInterval(intervalId)
    }, [])

    useEffect(() => {
        const api: GridApi = gridRef?.current?.api
        const data = readLocalStorageValue({ key: CSV_DATA_STORAGE_KEY })
        if (data) {
            api?.setGridOption("rowData", data)
        }
        const metadata = readLocalStorageValue({ key: METADATA_STORAGE_KEY })
        if (metadata?.defaultRowValue) {
            setDefaultRowValue(metadata.defaultRowValue)
        }
        setLoaded(true)
    }, [gridRef, loaded, gridReady])

    const editData = ({ rowIndex, colId, newValue }) => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        if (updateAll) {
            setDefaultRowValue((old) => {
                const newDefault = { ...old, [colId]: newValue }
                setMetadataValue("defaultRowValue", newDefault)
                return newDefault
            })
            api.forEachNode((rowNode) => rowNode.setDataValue(colId, newValue))
        } else {
            const row = api.getRowNode(rowIndex)
            row!.setDataValue(colId, newValue)
        }
    }

    const appendOperationToCurrentCell = (newValue: Operation) => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        const currentCellValue = api.getRowNode(activeCell.rowIndex.toString())
            ?.data[activeCell.colId]
        if (!currentCellValue) {
            return
        }

        const finalNewValue = [...currentCellValue, { symbol: newValue.symbol }]
        editData({ ...activeCell, newValue: finalNewValue })
    }

    const processCellCallback = useCallback(({ value }) => {
        if (typeof value === "string") {
            return value
        }

        return resolveValuesAndOperations(value).join(" ")
    }, [])

    const onTextObjectClick = async (wordObj) => {
        const api: GridApi = gridRef?.current?.api
        if (!api || !wordObj) {
            return
        }
        const currentCellValue =
            api.getRowNode(activeCell.rowIndex.toString())?.data[
                activeCell.colId
            ] ?? []

        const newValue = [...currentCellValue, wordObj]

        editData({ ...activeCell, newValue })
    }

    const applyTemplateToRowIndex = (rowIndex) => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        const template = api.getRowNode(templateRow.toString())?.data
        const data = []
        api.forEachNode((rowNode) => data.push(rowNode.data))
        const result = generateDataFromTemplate({
            template,
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
        // TODO: don't return the entire data set again?
        const rowNode: IRowNode | undefined = api.getRowNode(rowIndex)
        if (rowNode) {
            rowNode.setData(newData[rowIndex])
        } else {
            api.applyTransactionAsync({ add: [newData[rowIndex]] })
        }
    }

    const applyTemplateToActiveRow = () =>
        applyTemplateToRowIndex(activeCell.rowIndex)

    const addNewRow = () => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        api.applyTransaction({ add: [{ ...defaultRowValue }] })
    }

    const operationsEnabled = useMemo(() => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        const currentCell = api.getRowNode(activeCell.rowIndex.toString())
        const currentCellValue = currentCell?.data[activeCell.colId]

        return (
            currentCellValue?.length &&
            !isOperation(currentCellValue[currentCellValue.length - 1])
        )
    }, [activeCell])

    const clearCellData = () => {
        editData({ ...activeCell, newValue: [] })
    }

    const copyRow = (row) => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        setCopiedRow(api.getRowNode(row)?.data)
    }

    // to be used for "pasting" a template to a new row in cases like new pdf page
    // and auto-index-offset will fail
    const pasteRow = (row) => {
        const dataToInject = copiedRow
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
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        api.getRowNode(row)?.setData(newRow)
        setTemplateRow(row)
    }

    const addNewTemplatedRow = () => {
        // addNewRow()
        setActiveCell((old) => ({
            ...old,
            rowIndex: old.rowIndex + 1,
        }))
        applyTemplateToRowIndex(activeCell.rowIndex + 1)
    }

    const adjustRowTemplateIndex = (rowIndex, value) => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        const currentTemplate = api.getRowNode(rowIndex)?.data
        const baseIndex = getFirstTemplateValue(currentTemplate)?.index
        // const baseIndex = values[0]?.[0]?.index
        const offset = value - baseIndex
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
        api.getRowNode(rowIndex)?.setData(newTemplateValue)
    }

    const onRowSelected = useCallback(
        (e) => {
            if (!e.event?.target) {
                return
            }
            if (e.rowIndex === selectedRow && !e.event.target.checked) {
                setSelectedRow(-1)
            } else if (e.event.target.checked) {
                setSelectedRow(e.rowIndex)
            }
        },
        [selectedRow]
    )

    const onCellClicked = useCallback(
        ({ node, colDef }: { node: RowNode; colDef: ColDef }) =>
            setActiveCell({
                colId: colDef.colId!,
                rowIndex: node.rowIndex!,
            }),
        []
    )

    const deleteRow = useCallback((row: number) => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        api.applyTransaction({ remove: [api.getRowNode(row)?.id] })
        setActiveCell((old) => ({ ...old, rowIndex: 0 }))
    }, [])

    const resetData = () => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }
        api.setGridOption("rowData", [])
        setDefaultRowValue({})
        setMetadataValue("defaultRowValue", {})
    }

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
                                getFirstTemplateValue(
                                    gridRef.current?.api?.getRowNode(
                                        templateRow
                                    )
                                )?.index
                            }
                            disabled={
                                getFirstTemplateValue(
                                    gridRef.current?.ap?.getRowNode(templateRow)
                                )?.index === undefined ||
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
                    <CSVGrid
                        ref={gridRef}
                        editingMode={editingMode}
                        setDataValue={editData}
                        onRowSelected={onRowSelected}
                        onCellClicked={onCellClicked}
                        processCellCallback={processCellCallback}
                        onGridReady={() => setGridReady(true)}
                    ></CSVGrid>
                </ResizableAffix>
            </TemplateContext.Provider>
            {/* </Group> */}
        </>
    )
}

export default App
