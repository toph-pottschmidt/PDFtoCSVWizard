# Introduction

PDFtoCSVWizard is a tool designed for overhauling data-entry from PDFs to CSVs by simply clicking on texts, and working upward to powerful abstractions like templating rows and (coming soon) pages.

# Use

This tool should be published at https://toph-pottschmidt.github.io/PDFtoCSVWizard/ if you would just like to use it.

## Instructions

1. Click "Upload PDF" button to start. Select the PDF you would like to extract data from.
2. Add Data:
    - Manual Mode (for static text values, unchanging per row)
        - Select "Manual Mode" on the top left of the Grid panel.
        - (Optional) Click "Update all rows" to set the default value for that column. All new rows will have this value if selected.
        - Click in the cell you want to type, and enter the desired text.
        - Enter to confirm.
        - IMPORTANT: Uncheck "Update all rows" before going back to template mode.
    - Template Mode
        - Click Text in the PDF to add a text object to the grid.
        - Adjust selected grid cell by using Arrow Keys or WASD to move your "cursor" around the grid (clicking in a cell works too).
        - Repeat the process for each cell in a row.
3. Template Use
    - Once you have filled out a row with data, you can click "Row Actions" -> "Set as Template".
    - Fill out one templated piece of data for the next row.
    - Move your cursor to the next row, then press "Apply Template"
    - The rest of the row should auto-populate based on the previously created template.
    - With one manual application complete, "Add new templated row" button should be enabled. Click it to add a new row that automatically applies the template you created to the next set of data.
4. Operations
    - In a data cell with Template mode, you can apply basic mathematical operations to calculate data for the output CSV.
    - Click one numeric piece of data
    - Click the desired operation (+, -, /, \*)
    - Select another number.
    - The cell should preview the result if the objects and calculations are compatible. If you see no preview, double check to make sure the data you are entering can be interpreted numerically as a base10 number.
    - NOTE: Order of operations is not respected. Think of it as a "simple" calculator, e.g. 1 + 2 + 3 + 4 / 5 = 10, not 6.8 If you need more complex formulas, please export the CSV to a spreadsheet application and create the formula yourself.
5. Export CSV

NOTE: The website will auto-save your work every 30 seconds, and will retain your most recent PDF file in case of a crash as a convenience to you. Clear your browser cache if you need to reset all data for the application.

# Local development, installation, contributing, etc.

Ensure you have the latest version of Node, This application was developed with version 23.11. I suggest Volta to handle npm versioning if you don't already have a solution.

```
git clone git@github.com:toph-pottschmidt/PDFtoCSVWizard.git
cd PDFtoCSVWizard
npm ci
npm run dev
```
