const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// We just want to see if any obvious syntax errors occur when we evaluate the script tags
const scriptContent = html.split('<script>')[1].split('</script>')[0];

console.log("Extracted script length:", scriptContent.length);

// We need a dummy DOM to eval this
try {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html, { runScripts: "dangerously" });
    console.log("Scripts ran without immediate top-level errors? ", !!dom);
} catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') {
        console.error("DOM Error", e);
    } else {
        console.log("JSDOM not found, skipping DOM eval");
    }
}
