import { XAutoClient } from '../dist/index.js';

const socketPath = process.env.X_AUTO_SOCKET;
if (!socketPath) throw new Error('请设置 X_AUTO_SOCKET，例如 ~/.x-auto/state/<profile-id>.sock');

const main = async () => {
  const client = new XAutoClient({ socketPath });
  console.log(await client.ready());

  // Copy the call you need into the application that integrates x-auto:
  // console.log(await client.post({ text: '要发布的推文内容' }));
  // console.log(await client.thread({ posts: ['第一条', '第二条'] }));
  // console.log(await client.like({ tweet: 'https://x.com/user/status/123' }));
  // console.log(await client.comment({ tweet: '123', text: '评论内容' }));
  // console.log(await client.quote({ tweet: '123', text: '引用内容' }));
  // console.log(await client.retweet({ tweet: '123' }));
};

main().catch((error) => {
  console.error(JSON.stringify({ code: error.code, message: error.message, details: error.details }, null, 2));
  process.exitCode = 1;
});
