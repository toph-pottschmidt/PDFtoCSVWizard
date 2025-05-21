import { useState } from "react"
import { Button, Stack, Modal, TextInput, Group } from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"
import { GridApi } from "ag-grid-community"

type ExportCSVButtonProps = {
    api: GridApi
}

export const ExportCSVButton = ({ api }: ExportCSVButtonProps) => {
    const [opened, { open, close }] = useDisclosure()

    const [fileName, setFileName] = useState("export.csv")

    const onExport = () => {
        console.log(fileName)
        const exportFileName = fileName.trim().endsWith(".csv")
            ? fileName
            : `${fileName}.csv`
        api.exportDataAsCsv({ fileName: exportFileName })
        close()
    }

    return (
        <>
            <Modal opened={opened} onClose={close} title={"Export"}>
                <Stack gap="sm">
                    <TextInput
                        label={"Enter a filename for your CSV export"}
                        defaultValue={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        error={fileName === "" && "Filename must not be empty"}
                    />
                    <Group>
                        <Button onClick={onExport}>Export</Button>
                        <Button onClick={close} variant="outline">
                            Cancel
                        </Button>
                    </Group>
                </Stack>
            </Modal>
            <Button onClick={open}>Export as CSV</Button>
        </>
    )
}
