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

    const [data, setData] = useState(startData)
    const [currentPageTextData, setCurrentPageTextData] = useState([])
    const documentRef = useRef(null)
    const [mostRecentClickedText, setMostRecentClickedText] = useState("")

    const [activeCell, setActiveCell] = useState<ActiveCell>(defaultActiveCell)

    const [templateRow, setTemplateRow] = useState<number>(-1)
    const [templateOffset, setTemplateOffset] = useState<number>(-1)

    // Create a gridRef
    const gridRef = useRef<RefObject<GridApi>>(null)
    // function to update all rows with value
    const [updateAll, setUpdateAll] = useState(false)
    const [editingMode, setEditingMode] = useState(TEMPLATE_MODE)

    const [scale, setScale] = useState(1.25)

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
    console.log(currentPageTextData)

    const editData = ({ rowIndex, colId, newValue }) => {
        const api: GridApi = gridRef?.current?.api
        if (!api) {
            return
        }

        // TODO: is this pure? idk.
        if (updateAll) {
            // set each data row value by column id to the new value
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

    const processCellCallback = ({ api, value, node, column }) => {
        if (typeof value === "string") {
            return value
        }
        console.log(value)

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

    const applyTemplateToActiveRow = () => {
        // selectedTemplate
        // { key: obj }
        setData((oldData) => {
            const result = generateDataFromTemplate({
                template: oldData[templateRow],
                templateRowIndex: templateRow,
                rowIndex: activeCell.rowIndex,
                data: oldData,
                currentTextObjects: currentPageTextData,
                templateOffset,
            })
            if (!result) {
                // error
                return oldData
            }
            const { data, offsetUsed } = result
            setTemplateOffset(offsetUsed)

            return data
        })
    }

    const onPageClick = async (event) => {
        const closest = getClosestTextToMouseEvent(event, true)
        setMostRecentClickedText(closest?.str)
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

    const addNewRow = () => setData((old) => [...old, {}])

    const operationsEnabled =
        currentCellValue.length &&
        !isOperation(currentCellValue[currentCellValue.length - 1])

    const clearCellData = () => {
        editData({ ...activeCell, newValue: [] })
    }

    const exportToCSV = () => {
        gridRef.current.api.exportDataAsCsv()
    }

    return (
        <>
            <Title>PDF Parsing Utility</Title>
            <Group>
                <FileButton onChange={handleFileChange} accept=".pdf">
                    {(props) => <Button {...props}>Upload PDF</Button>}
                </FileButton>

                {file && (
                    <Pagination
                        value={currentPage}
                        total={numPages}
                        siblings={5}
                        onChange={setCurrentPage}
                    />
                )}
                {mostRecentClickedText && (
                    <Text>You just clicked {mostRecentClickedText}</Text>
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
                {/* <Checkbox
                    checked={updateAll}
                    onChange={(e) => setUpdateAll(e.target.checked)}
                    label="Update all rows simultaneously?"
                /> */}
                <SegmentedControl
                    m={"sm"}
                    value={editingMode}
                    data={[MANUAL_MODE, TEMPLATE_MODE]}
                    onChange={setEditingMode}
                />
                <Group gap={"sm"} p={"sm"}>
                    <Button
                        onClick={() =>
                            appendOperationToCurrentCell(OPERATIONS.ADD)
                        }
                        disabled={!operationsEnabled}
                    >
                        {"Add"}
                    </Button>
                    <Button
                        onClick={() =>
                            appendOperationToCurrentCell(OPERATIONS.SUBTRACT)
                        }
                        disabled={!operationsEnabled}
                    >
                        {"Subtract"}
                    </Button>
                    <Button
                        onClick={() =>
                            appendOperationToCurrentCell(OPERATIONS.MULTIPLY)
                        }
                        disabled={!operationsEnabled}
                    >
                        {"Multiply"}
                    </Button>
                    <Button
                        onClick={() =>
                            appendOperationToCurrentCell(OPERATIONS.DIVIDE)
                        }
                        disabled={!operationsEnabled}
                    >
                        {"Divide"}
                    </Button>
                </Group>
                <Group gap={"sm"} p={"sm"}>
                    <Button onClick={addNewRow}>Add Row</Button>
                    <Button onClick={clearCellData}>Clear Cell</Button>
                    <Button
                        onClick={() => applyTemplateToActiveRow()}
                        disabled={
                            templateRow === activeCell.rowIndex ||
                            templateRow == -1
                        }
                    >
                        Apply Template
                    </Button>
                    <Button onClick={() => exportToCSV()}>Export to CSV</Button>
                </Group>
                {/* <div style={{ height: 720, width: "100%" }}> */}
                <CSVGrid
                    ref={gridRef}
                    data={data}
                    editingMode={editingMode}
                    processCellCallback={processCellCallback}
                ></CSVGrid>
                {/* </div> */}
            </TemplateContext.Provider>
            {/* </Group> */}
        </>
    )
}

export default App
