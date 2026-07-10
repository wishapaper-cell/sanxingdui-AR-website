// 测试文生图
const resp = await fetch('http://127.0.0.1:3001/api/text-to-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: '纵目青铜面具' }),
});
const data = await resp.json();
console.log('HTTP status:', resp.status);
console.log('Response:', JSON.stringify(data, null, 2));
