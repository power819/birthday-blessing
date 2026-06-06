// Start script - launches both server and public tunnel
const { spawn } = require('child_process');
const path = require('path');

console.log('\n🎂 启动生日祝福生成器...\n');

// Start the Express server
const server = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: 'pipe'
});

server.stdout.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('已启动')) {
    console.log('  ✅ 本地服务已启动: http://localhost:3001\n');
    startTunnel();
  }
});

server.stderr.on('data', (data) => {
  console.error(data.toString());
});

function startTunnel() {
  console.log('  🌐 正在生成公网地址...\n');

  const ltBin = path.join(__dirname, 'node_modules', 'localtunnel', 'bin', 'lt.js');
  const lt = spawn('node', [ltBin, '--port', '3001'], {
    cwd: __dirname,
    stdio: 'pipe'
  });

  lt.stdout.on('data', (data) => {
    const msg = data.toString();
    const match = msg.match(/https:\/\/[^\s]+\.loca\.lt/);
    if (match) {
      console.log('============================================');
      console.log('  ✅ 网站已启动！');
      console.log('');
      console.log(`  🌐 公网地址: ${match[0]}`);
      console.log('  🏠 本地地址: http://localhost:3001');
      console.log('');
      console.log('  把这个公网地址发到手机，或者手机上扫码');
      console.log('  就可以打开生日祝福生成器了~');
      console.log('');
      console.log('  ⚠  Ctrl+C 关闭。保持窗口不关，地址就不会变');
      console.log('============================================\n');
    }
  });

  lt.stderr.on('data', (data) => {
    const msg = data.toString();
    const match = msg.match(/https:\/\/[^\s]+\.loca\.lt/);
    if (match) {
      console.log(`  🌐 公网地址: ${match[0]}\n`);
    }
  });
}

process.on('SIGINT', () => {
  console.log('\n👋 服务器已关闭');
  process.exit(0);
});
