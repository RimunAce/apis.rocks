/**
 * DDoS Simulation Load Test
 *
 * This script simulates a DDoS attack by making many concurrent requests to the server.
 * Use this to test if your DDoS protection is working correctly.
 *
 * WARNING: Only use this against your own server in a controlled environment! Do not use this against another server!
 * Like come on dude. Have some common sense and don't be a dick.
 * You won't achieve much by using this anyway. Like, bro. This ain't even a real DDoS attack.
 *
 * Usage:
 * bun run src/utility/ddos/load-test.ts <target-url> <requests-per-second> <duration-seconds>
 *
 * Example:
 * bun run src/utility/ddos/load-test.ts http://localhost:3000/api/test 50 10
 */

const args = process.argv.slice(2);
const targetUrl = args[0] || "http://localhost:3000/api/test";
const requestsPerSecond = parseInt(args[1] || "50");
const durationSeconds = parseInt(args[2] || "10");

console.log(`=== DDoS Simulation Load Test ===`);
console.log(`Target URL: ${targetUrl}`);
console.log(`Requests per second: ${requestsPerSecond}`);
console.log(`Duration: ${durationSeconds} seconds`);
console.log(
  `Total requests to be sent: ${requestsPerSecond * durationSeconds}`
);
console.log(`\nStarting test in 3 seconds...`);

setTimeout(async () => {
  console.log(`\nTest started at ${new Date().toISOString()}`);

  const startTime = Date.now();
  let successCount = 0;
  let redirectCount = 0;
  let errorCount = 0;
  let totalRequests = 0;

  async function makeRequest() {
    try {
      const response = await fetch(targetUrl);
      totalRequests++;

      if (response.redirected) {
        redirectCount++;
        if (response.url.includes("youtube.com/watch")) {
          process.stdout.write("R");
        } else {
          process.stdout.write("r");
        }
      } else if (response.ok) {
        successCount++;
        process.stdout.write(".");
      } else {
        errorCount++;
        process.stdout.write("x");
      }
    } catch (error) {
      errorCount++;
      process.stdout.write("E");
    }
  }

  const intervalId = setInterval(() => {
    for (let i = 0; i < requestsPerSecond; i++) {
      makeRequest();
    }
  }, 1000);

  setTimeout(() => {
    clearInterval(intervalId);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`\n\nTest completed at ${new Date().toISOString()}`);
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Total requests sent: ${totalRequests}`);
    console.log(
      `Success: ${successCount} (${(
        (successCount / totalRequests) *
        100
      ).toFixed(2)}%)`
    );
    console.log(
      `Redirects: ${redirectCount} (${(
        (redirectCount / totalRequests) *
        100
      ).toFixed(2)}%)`
    );
    console.log(
      `Errors: ${errorCount} (${((errorCount / totalRequests) * 100).toFixed(
        2
      )}%)`
    );

    const successMessage = `\n✅ DDoS protection appears to be working! Requests were blocked with 429 status code.`;

    if (errorCount > 0 && errorCount / totalRequests > 0.5) {
      console.log(successMessage);
    } else {
      console.log(
        `\n❌ No rate limiting detected. DDoS protection might not be working correctly.`
      );
    }

    process.exit(0);
  }, durationSeconds * 1000);
}, 3000);
