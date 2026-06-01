// tests/helpers/makeRequest.js
export function makeRequest(functionName, body) {
  return new Request(`http://localhost/${functionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}
