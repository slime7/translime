const fs = require('fs');
const path = require('path');

try {
  // Use tags.json for components
  const tagsPath = require.resolve('vuetify/dist/json/tags.json');
  const tags = JSON.parse(fs.readFileSync(tagsPath, 'utf-8'));
  const componentNames = Object.keys(tags).filter(name => name.startsWith('V'));

  // Use importMap.json for directives
  const importMapPath = require.resolve('vuetify/dist/json/importMap.json');
  const importMap = JSON.parse(fs.readFileSync(importMapPath, 'utf-8'));
  const directiveNames = importMap.directives || [];
  
  const dtsPath = path.resolve(__dirname, '../src/index.d.ts');
  const dtsContent = fs.readFileSync(dtsPath, 'utf-8');
  
  // Find the start of "declare global {"
  const splitMarker = 'declare global {';
  const parts = dtsContent.split(splitMarker);
  
  if (parts.length < 2) {
    console.error('Could not find "declare global {" in index.d.ts');
    process.exit(1);
  }
  
  const prefix = parts[0];
  
  // Generate declarations
  const componentLines = componentNames.map(name => `  const ${name}: Component;`).join('\n');
  const directiveLines = directiveNames.map(name => `  const ${name}: Directive;`).join('\n');
  
  const newContent = `${prefix}${splitMarker}
  // Components
${componentLines}

  // Directives
${directiveLines}
}
`;

  fs.writeFileSync(dtsPath, newContent);
  console.log(`Updated index.d.ts with ${componentNames.length} components and ${directiveNames.length} directives.`);
  
} catch (error) {
  console.error('Error generating types:', error);
  process.exit(1);
}
