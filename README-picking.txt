# Picking App

## Files
- `index.html`
- `app.js`

## API hardcoded
https://script.google.com/macros/s/AKfycbxJl4vMd8YJlmrZv90Wo2pUh8-mxLno2oPPisB6NkN3FjoYbFYSncu3JN-MdrXYwNdfSA/exec

## Google Sheet reference
https://docs.google.com/spreadsheets/d/1ODNEqtj2PdGByUlSGkAgrkDdqBp72-3lmxktdJPT_yo/edit?gid=1327967099#gid=1327967099

## Deploy
1. Upload `index.html` and `app.js` to repo root
2. Enable GitHub Pages from `main` and `/(root)`
3. Open site URL

## Important
Frontend này giả định Apps Script API đã hỗ trợ các action:
- `getOrdersSummary`
- `getPickingLines`
- `saveLineAction`
- `releaseOrder`
- `getNextOrderAfter`

Nếu web vẫn báo `Failed to fetch` hoặc không đọc được JSON, lỗi nằm ở Apps Script API hoặc quyền public của deployment hiện tại.
