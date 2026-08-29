import http from 'node:http';

const socketPath = process.env.X_AUTO_SOCKET;
if (!socketPath) throw new Error('请设置 X_AUTO_SOCKET，例如 ~/.x-auto/state/<profile-id>.sock');

export const request = (method, path, body) => new Promise((resolve, reject) => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const req = http.request({
    socketPath,
    method,
    path,
    headers: payload === undefined ? {} : {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
    },
  }, (response) => {
    let data = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { data += chunk; });
    response.on('end', () => {
      try {
        const result = JSON.parse(data);
        if ((response.statusCode ?? 500) >= 400 || result.success === false) {
          const error = new Error(result.error?.message || `x-auto request failed: ${path}`);
          error.code = result.error?.code;
          error.details = result.error;
          reject(error);
          return;
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });

  req.on('error', reject);
  if (payload !== undefined) req.write(payload);
  req.end();
});

const main = async () => {
  console.log(await request('GET', '/ready'));

  // Copy the call you need into the application that integrates x-auto:
  // console.log(await request('POST', '/post', { text: '要发布的推文内容' }));
  // console.log(await request('POST', '/thread', { posts: ['第一条', '第二条'] }));
  // console.log(await request('POST', '/like', { tweet: 'https://x.com/user/status/123' }));
  // console.log(await request('POST', '/comment', { tweet: '123', text: '评论内容' }));
  // console.log(await request('POST', '/quote', { tweet: '123', text: '引用内容' }));
  // console.log(await request('POST', '/retweet', { tweet: '123' }));
};

main().catch((error) => {
  console.error(JSON.stringify({ code: error.code, message: error.message, details: error.details }, null, 2));
  process.exitCode = 1;
});
