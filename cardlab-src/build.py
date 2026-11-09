"""Bundle the Card Combat Lab into one HTML file: shell + portraits + engine + ui."""
import json, pathlib
here = pathlib.Path(__file__).parent
shell = (here/'shell.html').read_text()
por = json.loads((here/'portraits.json').read_text())
engine = (here/'engine.js').read_text().replace("if(typeof module!=='undefined')", "if(false)")
ui = (here/'ui.js').read_text()
out = shell.replace('/*PORTRAITS*/', 'const PORTRAITS_LAB = ' + json.dumps(por) + ';').replace('/*ENGINE*/', engine).replace('/*UI*/', ui)
(here/'cardlab.html').write_text(out)
print('built cardlab.html', len(out)//1024, 'KB')
