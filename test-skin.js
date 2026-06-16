import fs from "fs";
const data = JSON.stringify({
  images: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3wYEChQOaP3CwgAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAAALSURBVAjXY2L4DwABhQGAT+HExAAAAABJRU5ErkJggg=="],
  questionnaireData: {},
  userProfile: { age: 30 }
});

fetch("http://127.0.0.1:3000/api/gemini/analyze-skin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: data
})
.then(r => r.text())
.then(console.log)
.catch(console.error);
