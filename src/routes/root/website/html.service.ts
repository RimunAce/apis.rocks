import { Elysia, t } from "elysia";
import { envService } from "../../../utility/env/env.service";
import os from "node:os";

const API_VERSION = "1.2.2";

const getSystemMetrics = () => {
  const uptimeSeconds = Math.floor(process.uptime());
  const days = Math.floor(uptimeSeconds / (24 * 60 * 60));
  const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60);
  const seconds = uptimeSeconds % 60;

  const uptimeFormatted = `${days}d ${hours}h ${minutes}m ${seconds}s`;

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const ramUsagePercent = Math.round((usedMemory / totalMemory) * 100);

  const cpuCount = os.cpus().length;
  const loadAvg = os.loadavg()[0];
  const cpuUsagePercent = Math.min(Math.round((loadAvg / cpuCount) * 100), 100);

  return {
    uptimeSeconds,
    uptimeFormatted,
    ramUsagePercent,
    cpuUsagePercent,
  };
};

// In James word: "I don't work with pure HTML and CSS. I quit"

const getStyles = () => `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: Arial, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
    position: relative;
    overflow: hidden;
  }
  
  .background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    background-image: url('https://cdn.apis.rocks/backgrounds/anime-background.webp');
    background-size: cover;
    background-position: center;
    filter: blur(5px);
  }
  
  @media (min-width: 768px) {
    .background {
      background-attachment: fixed;
    }
  }
  
  .sparkles {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
    pointer-events: none;
    overflow: hidden;
  }
  
  .sparkle {
    position: absolute;
    width: 5px;
    height: 5px;
    background-color: rgba(255, 255, 255, 0.8);
    border-radius: 50%;
    box-shadow: 0 0 10px 2px rgba(255, 255, 255, 0.8);
    animation: float-up 8s linear infinite;
  }
  
  @keyframes float-up {
    0% {
      transform: translateY(100vh) scale(0);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    90% {
      opacity: 1;
    }
    100% {
      transform: translateY(-20vh) scale(1);
      opacity: 0;
    }
  }
  
  .container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    position: relative;
    z-index: 10;
  }
  
  table {
    border-collapse: collapse;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    background-color: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    overflow: hidden;
    backdrop-filter: blur(10px);
  }
  
  th, td {
    padding: 12px 15px;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }
  
  th {
    background-color: #4a69bd;
    color: white;
    text-align: center;
  }
  
  tr:last-child td {
    border-bottom: none;
  }
  
  .usage-box {
    background-color: rgba(255, 255, 255, 0.9);
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    backdrop-filter: blur(10px);
    color: #222;
  }
  
  .usage-title {
    margin-top: 0;
    margin-bottom: 10px;
    color: #222;
    font-size: 16px;
    font-weight: bold;
  }
  
  .progress-container {
    height: 24px;
    background-color: #e0e0e0;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    margin-bottom: 5px;
  }
  
  .progress-bar {
    height: 100%;
    background-color: #4a69bd;
    border-radius: 12px;
    transition: width 0.5s ease-in-out;
  }
  
  .progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-weight: bold;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.5);
  }
  
  pre {
    margin: 0;
    white-space: pre-wrap;
  }
`;

const getJavaScript = (
  uptimeSeconds: number,
  ramUsagePercent: number,
  cpuUsagePercent: number
) => `
  function formatUptime(uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / (24 * 60 * 60));
    const hours = Math.floor((uptimeSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptimeSeconds % (60 * 60)) / 60);
    const seconds = uptimeSeconds % 60;
    return \`\${days}d \${hours}h \${minutes}m \${seconds}s\`;
  }

  let currentUptimeSeconds = ${uptimeSeconds};
  const startTime = Date.now();

  function updateUptime() {
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    
    const totalUptimeSeconds = currentUptimeSeconds + elapsedSeconds;
    
    const uptimeElement = document.getElementById('uptime');
    if (uptimeElement) {
      uptimeElement.textContent = formatUptime(totalUptimeSeconds);
    }
  }
  
  function simulateResourceUsage() {
    const ramInitial = ${ramUsagePercent};
    const ramVariation = Math.random() * 10 - 5;
    let ramUsage = Math.max(0, Math.min(100, ramInitial + ramVariation));
    
    const cpuInitial = ${cpuUsagePercent};
    const cpuVariation = Math.random() * 20 - 5;
    let cpuUsage = Math.max(0, Math.min(100, cpuInitial + cpuVariation));
    
    const ramBar = document.getElementById('ram-bar');
    const ramText = document.getElementById('ram-text');
    if (ramBar && ramText) {
      ramBar.style.width = \`\${ramUsage}%\`;
      ramText.textContent = \`\${Math.round(ramUsage)}%\`;
    }
    
    const cpuBar = document.getElementById('cpu-bar');
    const cpuText = document.getElementById('cpu-text');
    if (cpuBar && cpuText) {
      cpuBar.style.width = \`\${cpuUsage}%\`;
      cpuText.textContent = \`\${Math.round(cpuUsage)}%\`;
      
      if (cpuUsage > 80) {
        cpuBar.style.backgroundColor = '#e74c3c';
      } else if (cpuUsage > 60) {
        cpuBar.style.backgroundColor = '#f39c12';
      } else {
        cpuBar.style.backgroundColor = '#4a69bd';
      }
    }
  }
  
  function createSparkles() {
    const sparklesContainer = document.querySelector('.sparkles');
    const screenWidth = window.innerWidth;
    
    for (let i = 0; i < 50; i++) {
      const sparkle = document.createElement('div');
      sparkle.classList.add('sparkle');
      
      const size = Math.random() * 4 + 2;
      const posX = Math.random() * screenWidth;
      const delay = Math.random() * 8;
      const duration = Math.random() * 4 + 6;
      const opacity = Math.random() * 0.5 + 0.3;
      
      sparkle.style.width = \`\${size}px\`;
      sparkle.style.height = \`\${size}px\`;
      sparkle.style.left = \`\${posX}px\`;
      sparkle.style.animationDelay = \`\${delay}s\`;
      sparkle.style.animationDuration = \`\${duration}s\`;
      sparkle.style.opacity = opacity;
      
      sparklesContainer.appendChild(sparkle);
    }
  }

  function handleParallax(e) {
    if (window.innerWidth <= 768) return;
    
    const background = document.querySelector('.background');
    
    const mouseX = e.clientX / window.innerWidth;
    const mouseY = e.clientY / window.innerHeight;
    
    const moveX = (0.5 - mouseX) * 30;
    const moveY = (0.5 - mouseY) * 30;
    
    background.style.transform = \`translate(\${moveX}px, \${moveY}px)\`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    setInterval(updateUptime, 1000);
    setInterval(simulateResourceUsage, 3000);
    createSparkles();
    
    if (window.innerWidth > 768) {
      document.addEventListener('mousemove', handleParallax);
    }
  });
`;

const getHtmlBody = (
  uptimeFormatted: string,
  ramUsagePercent: number,
  cpuUsagePercent: number
) => `
  <div class="background"></div>
  <div class="sparkles"></div>
  <div class="container">
    <table>
      <tr>
        <th colspan="2">APIs.rocks Service Information</th>
      </tr>
      <tr>
        <td><strong>API Version:</strong></td>
        <td>${API_VERSION}</td>
      </tr>
      <tr>
        <td><strong>Service Uptime:</strong></td>
        <td id="uptime">${uptimeFormatted}</td>
      </tr>
      <tr>
        <td><strong>Environment:</strong></td>
        <td>${envService.get("NODE_ENV") || "development"}</td>
      </tr>
      <tr>
        <td colspan="2">
          <strong>Changelog:</strong>
          <pre>
- Added YouTube MP3 extraction service
- Improved error handling for AI routes
- Added health monitoring endpoints
          </pre>
        </td>
      </tr>
    </table>
    
    <div class="usage-box">
      <h3 class="usage-title">RAM Usage</h3>
      <div class="progress-container">
        <div id="ram-bar" class="progress-bar" style="width: ${ramUsagePercent}%"></div>
        <div id="ram-text" class="progress-text">${ramUsagePercent}%</div>
      </div>
    </div>
    
    <div class="usage-box">
      <h3 class="usage-title">CPU Usage</h3>
      <div class="progress-container">
        <div id="cpu-bar" class="progress-bar" style="width: ${cpuUsagePercent}%"></div>
        <div id="cpu-text" class="progress-text">${cpuUsagePercent}%</div>
      </div>
    </div>
  </div>
`;

const generateHtml = (metrics: ReturnType<typeof getSystemMetrics>) => {
  const { uptimeSeconds, uptimeFormatted, ramUsagePercent, cpuUsagePercent } =
    metrics;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>APIs.rocks Service</title>
      <style>${getStyles()}</style>
      <script>${getJavaScript(
        uptimeSeconds,
        ramUsagePercent,
        cpuUsagePercent
      )}</script>
    </head>
    <body>
      ${getHtmlBody(uptimeFormatted, ramUsagePercent, cpuUsagePercent)}
    </body>
    </html>
  `;
};

const htmlService = new Elysia().get(
  "/",
  async ({ set, request }) => {
    const metrics = getSystemMetrics();
    const html = generateHtml(metrics);

    set.headers["Content-Type"] = "text/html";
    return html;
  },
  {
    detail: {
      summary: "Landing Page",
      description:
        "Returns the main landing page HTML with service information",
      tags: ["GENERAL"],
    },
    response: {
      200: t.String({
        description: "HTML content of the landing page",
      }),
      429: t.Object(
        {
          error: t.String(),
          message: t.String(),
        },
        {
          description: "Rate limit exceeded",
        }
      ),
    },
  }
);

export default htmlService;
