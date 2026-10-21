/**
 * Example template — used for building HTML strings (emails, PDFs, etc.).
 * Export a `createDemoTemplate` function per the folder-structure-guide.
 */
export const createDemoTemplate = ({ name }) => `
  <div>
    <h1>Hello, ${name}!</h1>
    <p>This is an example template.</p>
  </div>
`
