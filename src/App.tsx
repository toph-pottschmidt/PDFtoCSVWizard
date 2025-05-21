import "./App.css"
import {
    Button,
    FileButton,
    Group,
    Title,
    Text,
    Checkbox,
    SegmentedControl,
    Pagination,
    NumberInput,
} from "@mantine/core"
import { GridApi } from "ag-grid-community"
import { RefObject, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
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
} from "./pdfUtils"
import type { ActiveCell } from "./pdfUtils"
import { CSVGrid } from "./CSVTable"
import { ResizableAffix } from "./ResizeableAffix"
import { ExportCSVButton } from "./ExportCSVButton"

// setup pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
).toString()

const startData = [{}]

const options = {
    cMapUrl: "/cmaps/",
    standardFontDataUrl: "/standard_fonts/",
}

function App() {
    const [file, setFile] = useState<File | null>(null)
    const [numPages, setNumPages] = useState(0)
    const [currentPage, setCurrentPage] = useState(0)
    const [dimensions, setDimensions] = useState({ height: 0, width: 0 })
    const [loading, setLoading] = useState(true)

    const [data, setData] = useState<Array<object>>(startData)
    const [currentPageTextData, setCurrentPageTextData] = useState([])
    const documentRef = useRef(null)

    const [activeCell, setActiveCell] = useState<ActiveCell>(defaultActiveCell)

    const [templateRow, setTemplateRow] = useState<number>(-1)
    const [templateOffset, setTemplateOffset] = useState<number>(-1)

    // Create a gridRef
    const gridRef = useRef<RefObject<GridApi>>(null)
    // function to update all rows with value
    const [updateAll, setUpdateAll] = useState(false)
    const [editingMode, setEditingMode] = useState(TEMPLATE_MODE)

    const [scale, setScale] = useState(1.25)
    const [defaultRowValue, setDefaultRowValue] = useState<
        Record<string, object>
    >({})

    const [selectedRow, setSelectedRow] = useState<number>(-1)
    const [copiedRow, setCopiedRow] = useState<Array<object> | undefined>()

    const currentCellValue = data[activeCell.rowIndex][activeCell.colId] ?? []

    const handleFileChange = (file) => {
        if (!file) {
            return
        }
        setFile(file)
        setNumPages(0)
        setCurrentPage(0)
    }

    const onDocumentLoad = async (document) => {
        setNumPages(document.numPages)
        setCurrentPage(1)
        setLoading(false)
    }

    const onPageLoad = async (page) => {
        setDimensions({ height: page.height, width: page.width })

        const textContent = await page.getTextContent()
        const filteredSortedData = textContent.items
            .filter((t) => t.str.trim())
            .sort((a, b) =>
                a.transform[5] === b.transform[5]
                    ? a.transform[4] - b.transform[4]
                    : b.transform[5] - a.transform[5]
            )
            .map((t, i) => ({ ...t, index: i }))
        setCurrentPageTextData(filteredSortedData)
    }

    const editData = ({ rowIndex, colId, newValue }) => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }

        // TODO: is this pure? idk.
        if (updateAll) {
            // set each data row value by column id to the new value
            setDefaultRowValue((old) => ({ ...old, [colId]: newValue }))
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

    const appendOperationToCurrentCell = (newValue) => {
        if (!currentCellValue) {
            return
        }
        const finalNewValue = [...currentCellValue, newValue]
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

    const processCellCallback = ({ value }) => {
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

    const onPageClick = async (event) => {
        const closest = getClosestTextToMouseEvent(event, true)
        onTextObjectClick(closest)
    }

    const getClosestTextToMouseEvent = (e, requireInbounds = false) => {
        const docBoundingBox =
            documentRef?.current?.pages.current[
                currentPage - 1
            ].getBoundingClientRect() ?? {}
        const clickDimensions = {
            x: e.clientX - docBoundingBox.left,
            y: e.clientY - docBoundingBox.top,
        }

        let textObjectsToSort = currentPageTextData

        const shortCircutElement = document.elementsFromPoint(
            e.clientX,
            e.clientY
        )[0]
        // TODO: hardcoded tagname
        if (shortCircutElement.tagName === "SPAN") {
            textObjectsToSort = textObjectsToSort.filter(
                (t) => t.str === shortCircutElement.textContent
            )
        } else if (requireInbounds) {
            return
        }

        const sortedText = textObjectsToSort.sort((a, b) => {
            // "pdfY" is equivalent to height - y for some reason
            const aDiffValue = Math.hypot(
                dimensions.height - a.transform[5] * scale - clickDimensions.y,
                a.transform[4] * scale - clickDimensions.x
            )
            const bDiffValue = Math.hypot(
                dimensions.height - b.transform[5] * scale - clickDimensions.y,
                b.transform[4] * scale - clickDimensions.x
            )

            // we want lowest distance to click
            return aDiffValue - bDiffValue
        })
        return sortedText[0]
    }

    const addNewRow = () => setData((old) => [...old, defaultRowValue])

    const operationsEnabled =
        currentCellValue.length &&
        !isOperation(currentCellValue[currentCellValue.length - 1])

    const clearCellData = () => {
        editData({ ...activeCell, newValue: [] })
    }

    const exportToCSV = () => {
        gridRef.current.api.exportDataAsCsv()
    }

    const copyRow = () => {
        setCopiedRow(data[selectedRow])
    }

    // to be used for "pasting" a template to a new row in cases like new pdf page
    // and auto-index-offset will fail
    const pasteRow = () => {
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
                        (obj) => obj.index === v.index
                    ).str,
                }
            })
        })
        console.log(newRow)
        setData((old) => {
            const newData = [...old]
            newData.splice(activeCell.rowIndex, 1, newRow)
            return newData
        })
        setTemplateRow(selectedRow)
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
        const values = Object.values(currentTemplate)
        const baseIndex = values[0]?.[0]?.index
        const offset = value - baseIndex
        console.log(baseIndex, offset)
        const newTemplateValue: Record<string, object> = {}
        for (const [key, value] of Object.entries(currentTemplate)) {
            const newValue = value.map((v) => ({
                ...v,
                index: v.index + offset,
                str: currentPageTextData[v.index + offset].str,
            }))
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

    return (
        <>
            <Title>PDF Parsing Utility</Title>
            <Group>
                <FileButton onChange={handleFileChange} accept=".pdf">
                    {(props) => <Button {...props}>Upload PDF</Button>}
                </FileButton>
                <NumberInput
                    label={"Zoom"}
                    onChange={(v) => setScale(Number(v))}
                    step={0.05}
                    value={scale}
                    min={0.25}
                    max={4.0}
                />

                {file && (
                    <Pagination
                        value={currentPage}
                        total={numPages}
                        siblings={5}
                        onChange={setCurrentPage}
                    />
                )}
            </Group>
            {file && (
                <Text>
                    Page {currentPage} of {numPages}
                </Text>
            )}
            {file && <Text>Current file: {file.name}</Text>}
            {/* <Group wrap="nowrap"> */}
            <div
                style={{
                    height: file && !loading ? dimensions.height : undefined,
                    width: file && !loading ? dimensions.width : undefined,
                }}
            >
                <Document
                    ref={documentRef}
                    onClick={onPageClick}
                    file={file}
                    options={options}
                    onLoadSuccess={onDocumentLoad}
                >
                    <Page
                        scale={scale}
                        key={`page_${currentPage}`}
                        pageNumber={currentPage}
                        renderAnnotationLayer={false}
                        onLoadSuccess={onPageLoad}
                    />
                </Document>
            </div>
            <TemplateContext.Provider
                value={{
                    activeCell,
                    setActiveCell,
                    templateRow,
                    setTemplateRow,
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
                        <Button
                            onClick={() => copyRow()}
                            disabled={!data[selectedRow]}
                        >
                            Copy Template
                        </Button>
                        <Button
                            onClick={() => pasteRow()}
                            disabled={!(data[selectedRow] && !!copiedRow)}
                        >
                            Paste Template
                        </Button>
                        <NumberInput
                            value={
                                Object.values(data[templateRow] ?? {})[0]?.[0]
                                    ?.index
                            }
                            disabled={
                                Object.values(data[templateRow] ?? {})[0]?.[0]
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
                    </Group>
                    <CSVGrid
                        ref={gridRef}
                        data={data}
                        editingMode={editingMode}
                        setDataValue={editData}
                        onRowSelected={onRowSelected}
                        onCellClicked={onCellClicked}
                        processCellCallback={processCellCallback}
                    ></CSVGrid>
                </ResizableAffix>
            </TemplateContext.Provider>
            {/* </Group> */}
        </>
    )
}

export default App
