import {
    Button,
    FileButton,
    Group,
    Text,
    Pagination,
    NumberInput,
} from "@mantine/core"
import { useEffect, useRef, useState } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "@mantine/core/styles.css"
import "react-pdf/dist/esm/Page/TextLayer.css"
import { readLocalStorageValue, useLocalStorage } from "@mantine/hooks"
// setup pdfjs worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
).toString()

const PDF_DATA_STORAGE_KEY = "PdfToCsvWizard_ActivePDF"

function arrayBufferToBase64(buffer) {
    let binary = ""
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return window.btoa(binary)
}
function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64)
    const bytes = new Uint8Array(binary_string.length)
    for (let i = 0; i < binary_string.length; i++) {
        bytes[i] = binary_string.charCodeAt(i)
    }
    return bytes.buffer
}

const options = {
    cMapUrl: "/cmaps/",
    standardFontDataUrl: "/standard_fonts/",
}

export const PDFViewer = ({ onTextClick, onPageLoad: onPageLoadExternal }) => {
    const [numPages, setNumPages] = useState(0)
    const [currentPage, setCurrentPage] = useState(0)
    const [dimensions, setDimensions] = useState({ height: 0, width: 0 })
    const [loading, setLoading] = useState(true)

    const [savedFile, setSavedFile] = useLocalStorage({
        key: PDF_DATA_STORAGE_KEY,
        defaultValue: null,
    })
    const [loaded, setLoaded] = useState<boolean>(false)
    const [file, setFile] = useState<File | null>(savedFile)
    const [currentPageTextData, setCurrentPageTextData] = useState([])
    const documentRef = useRef(null)
    // Create a gridRef
    // function to update all rows with value

    const [scale, setScale] = useState(1.25)

    useEffect(() => {
        const pdfData = readLocalStorageValue({ key: PDF_DATA_STORAGE_KEY })
        if (pdfData) {
            const fileToSet = new File(
                [base64ToArrayBuffer(pdfData.content)],
                pdfData.name
            )
            setFile(fileToSet)
        }
        setLoaded(true)
    }, [])

    const handleFileChange = (file: File) => {
        if (!file) {
            return
        }
        const loadFileToLocalStorage = async () => {
            const pdfData = await file.arrayBuffer()

            console.log(pdfData)
            setSavedFile({
                content: arrayBufferToBase64(pdfData),
                name: file.name,
            })
        }
        loadFileToLocalStorage()
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
        onPageLoadExternal(filteredSortedData)
    }

    const onPageClick = async (event) => {
        const closest = getClosestTextToMouseEvent(event, true)
        onTextClick(closest)
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

    return (
        <>
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
                <NumberInput
                    w={100}
                    label={"Page"}
                    onChange={setCurrentPage}
                    step={1}
                    value={currentPage}
                    min={1}
                    max={numPages}
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
        </>
    )
}
