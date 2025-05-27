import { createContext } from "react"

const computeTemplateOffset = ({
    template,
    data,
    rowIndex,
    templateOffset
}) => {
    if (templateOffset !== -1) {
        return templateOffset
    }
    const selectedTemplate = template
    const currentRow = data[rowIndex]
    console.log("Current Row:", currentRow)
    // assume first filled row is the basis for template application
    // TODO: validate find method
    const templateBasisKey = Object.keys(currentRow).find(
        (key) =>
            currentRow[key] !== undefined && key !== "apply-template" && currentRow[key].some(v => v?.index)
    )
    console.log("Template Basis Key: ", templateBasisKey)
    if (templateBasisKey === undefined) {
        // error
        return
    }
    // gives original object with transform, str, etc.

    const templateBasis: object[] = currentRow[templateBasisKey]
    if (!templateBasis?.length && templateOffset === -1) {
        return
    }
    console.log("Template Basis: ", templateBasis)
    // find offset between basis and template row entry (first is sufficient)
    const offset = templateOffset === -1 ? 
        templateBasis[0].index -
        selectedTemplate[templateBasisKey][0].index : templateOffset

    // absolute value because the row indicates the sign of the operation
    return Math.abs(offset)
}

type TemplateGenerationFunctionProps = {
    templateOffset: number
    template: object
    data: object[]
    rowIndex: number,
    currentTextObjects: object[]
    templateRowIndex: number
}

export const generateDataFromTemplate = ({
    template,
    data,
    rowIndex,
    currentTextObjects,
    templateRowIndex,
    templateOffset
}: TemplateGenerationFunctionProps) => {
    // find offset between basis and template row entry (first is sufficient)
    const computedTemplateOffset = computeTemplateOffset({
        template,
        data,
        rowIndex,
        templateOffset
    })

    const selectedTemplate = template

    const newData = [...data]
    const currentRow = newData[rowIndex] ?? {}
    console.log("Current Row:", currentRow)

    console.log(computedTemplateOffset)
    if (computedTemplateOffset === undefined) {
        // manual entries can be propagated anyway
        return
    }


    const offset = computedTemplateOffset * (rowIndex - templateRowIndex)
    console.log("Offset: ", offset)
    const resultingRow = currentRow
    Object.keys(selectedTemplate).forEach((key) => {
        // apply offset congruently to all row entries of the template, respecting operations
        const resultingValue = []
        const templateValue = selectedTemplate[key] // array
        if (!templateValue) {
            return
        }
        console.log(key, templateValue)
        for (const templateObject of templateValue) {
            if (isOperation(templateObject) || templateObject.manual) {
                resultingValue.push(templateObject)
                continue
            }
            const finalIndex = templateObject.index + offset
            resultingValue.push(
                currentTextObjects.find(
                    (obj) => obj.index === finalIndex
                )
            )
        }
        resultingRow[key] = resultingValue
    })
    console.log(resultingRow)
    newData.splice(rowIndex, 1, resultingRow)
    return { data: newData, offsetUsed: computedTemplateOffset }
}


export const resolveValuesAndOperations = (values) => {
    let currentValueIndex = 0
    const outputValues = [] // will reduce
    if (!values) {
        console.log("no values, returning []")
        return []
    }
    while (currentValueIndex < values.length) {
        const currentValue = values[currentValueIndex]
        if (!currentValue) {
            currentValueIndex += 1
            continue
        }
        // apply mathematical operations
        if (
            isOperation(currentValue) &&
            currentValueIndex < values.length - 1
        ) {
            // isOperation can't succeed without getOperation succeeding
            const operation = getOperation(currentValue)!
            const lastValue = outputValues.pop() ?? Number(values[currentValueIndex - 1].str)
            const opOutput = operation.apply(
                lastValue,
                Number(values[currentValueIndex + 1].str)
            )
            outputValues.push(opOutput)
            currentValueIndex += 1
        }
        else if (currentValue.manual) {
            // manual string entry
            outputValues.push(currentValue.str)
        }
        // number yet to be processed
        else if (!isNaN(Number(currentValue.str))) {
            outputValues.push(Number(currentValue.str))
        }
        // string
        else if (typeof currentValue.str === "string") {
            const lastValue = outputValues.pop()
            outputValues.push(
                lastValue ? lastValue + " " + currentValue.str : currentValue.str
            )
        }

        currentValueIndex += 1
    }
    console.log(outputValues)
    return outputValues
}

export type ActiveCell = {
    rowIndex: number
    colId: string
}

export type TemplateContextProps = {
    activeCell: ActiveCell
    setActiveCell: (cell: ActiveCell) => void
    templateRow: number
    setTemplateRow: (row: number) => void
    deleteRow: (row: number) => void
    copyRow: (row: number) => void
    pasteRow: (row: number) => void
}

export const defaultActiveCell = {
    rowIndex: 0,
    colId: "",
}

export const TemplateContext = createContext<TemplateContextProps>({
    activeCell: defaultActiveCell,
    setActiveCell: () => {},
    templateRow: 0,
    setTemplateRow: () => {},
    deleteRow: () => {},
    copyRow: () => {},
    pasteRow: () => {},
})


export const MANUAL_MODE = "Manual Entry Mode"
export const TEMPLATE_MODE = "Template Mode"



export const isOperation = (op: Operation | object) =>
    Object.values(OPERATIONS).some((o) => o.symbol === op?.symbol)

export const getOperation = (op: Operation | object) => 
    Object.values(OPERATIONS).find((o) => o.symbol === op?.symbol)

export type Operation = {
    symbol: string
    apply: (a: number, b: number) => number
}

export const OPERATIONS: Record<string, Operation> = {
    ADD: {
        symbol: "+",
        apply: (a, b) => a + b,
    },
    SUBTRACT: {
        symbol: "-",
        apply: (a, b) => a - b,
    },
    MULTIPLY: {
        symbol: "x",
        apply: (a, b) => a * b,
    },
    DIVIDE: {
        symbol: "/",
        apply: (a, b) => a / b,
    },
}

export const getFirstTemplateValue = (rowValue) => {
    if (!rowValue) {
        return undefined
    }
    let templateValue
    Object.values(rowValue).forEach((v) => {
        if (Array.isArray(v)) {
            templateValue = v.find(v2 => v2?.index !== undefined)
        }
    })
    return templateValue
}