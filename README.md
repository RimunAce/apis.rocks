<p align="center">
  <img width="50%" height="50%" src="https://cdn.apis.rocks/banner/banner.webp" alt="Apis-Rocks-Img">
</p>

<p align="center">
   Open-Source Alternative to <a href="https://api.rimunace.xyz">API.RIMUNACE.XYZ</a> Written in <a href="https://elysiajs.com">Elysia.js</a>
</p>

<p align="center">
  <a href="https://elysiajs.com"><img src="https://img.shields.io/badge/ElysiaJS-eac0fe?style=for-the-badge&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC0AAAAtCAMAAAANxBKoAAABR1BMVEVHcExeXl43Nzc8PDxgYGCvr69ISEje3t5TU1OCgoI6OjplZWVjY2NOTk47OzvS0tJqampOTk57e3tiYmJeXl41NTVDQ0NFRUU5OTnk5ORgYGBtbW1ra2tcXFxiYmKDg4NeXl5eXl5CQkI7Ozvr6+vMzMzNzc38/Pzl5eViYmJvb29KSko2NjY1NTXOzs4+Pj51dXV3d3fNzc36+vq0tLTR0dFlZWVmZmZFRUXCwsKHh4fx8fE/Pz/s7OzOzs6MjIzg4OD////+/v7Y2Ni/v79eXl4zMzP////MzMwxMTFdXV3Pz880NDRfX185OTlCQkLS0tL+/v739/f7+/vx8fFRUVG3t7dXV1fExMS/v7/X19doaGju7u5aWlqfn5+Dg4N1dXXj4+PIyMhISEiysrLo6OiSkpKnp6dubm6tra1jY2OampqMjIy34KFfAAAARXRSTlMA99mqBgM9/h8LhxZZNL4neCj8DHbxZ3HQCPBmTai6EeCCWHv0PeEwXNQ8SOn5TX9CNrWyHOmmle3acqWU4Mef3+x4hubilUwEAAACuklEQVRIx72VV3eiUBSFVUaN0RgnMYkxzfTeM71kGhe4VFEQFAv2xPn/z3MpAorGNS/ZD7jWXZ97bc45nBsIvJ7Chw//Q999vwqEY7FY+GVu/WQRPRePyKNHLJlMYl/XIvHp9OK7H78PD+9oQZBLFAUAYFYy85E3U2lNPDjoiEjlvxJj8ACsYJEp9FFZJIbq1HgLBxfzE/Pc/iGjBQcn1CHOJBf8cCTTpWnNpYkaA2w85EuzEKKgomu2uRFJl2xzAMbxuQzy6BbFvEULQp4oNBwaZN564WUMAKol54cpim21SMici2PLHnr1ElC86gld6IiE2HVxZs2TI4Ssu8S4xLbVJjO6m+WaoZiGRvjllh3Mu69IcQ2lmPfTeafqIDRn03sMYCqK3cgC6nzB/GO+2KzzbvJVe0gxQD1HLVTTywItlKO6+lSrVznKrQrArBmOZ6hq1CpEmRyqDijKyzpRFlb4pllklyXpHjeCGuNoNXQP1I2cmkB61OaRM8MhOcH3rNbwggHTlimS8SvzDC9JparEcxzjbdB+BZVDNJ2bcm8w6ClGklYJsiyOV0vVktTi3IrvD1C1oohVaksVFsI6ouUGxB2xuMQ59Jpq5WgvIRSHfZUme30PbPASasm+SSfKpnWvYhKwTiqDyiiM1Bq25yZqpH6yCdjvNlgfjJe4y3OTfvhGaKTiBIXQz6JT/sKawvV7QidrLP6y+KT9Qfwi9OYSnEG3ru2pOv6pq/0ZNPw43BPr9x35eYZ1FXN23MlBewYNg+fuev0y03vLsz6PP1Vezp0bWShX02rCbu3mcDybGL0SPgcnwtnd5UAaD6bHbopwahKeMzzTwV3fzg9v5MbZ4JZR47nt9KQL4mx7xD67vRlDpzsbm5Nvh53E+9NskDWUPf1wEzMPYzvT77/47eZGKpVKnMUDr61/ax9VYWd/kEsAAAAASUVORK5CYII=" alt="ElysiaJS"/></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-82776e?style=for-the-badge&logo=bun" alt="Bun.sh"/></a>
  <a href="https://zod.dev"><img src="https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod" alt="Zod"/></a>
  <a href="https://github.com/winstonjs/winston"><img src="https://img.shields.io/badge/Winston-black?style=for-the-badge&logo=node.js" alt="Winston"/></a>
</p>

---

Prerequisites\*\*

- Node.js (v18.18.0 or higher) - [Download](https://nodejs.org/en/download/)
- Bun (v1.0.25 or higher) - [Download](https://bun.sh/download)
- Docker (v26.0.1 or higher) - [Download](https://www.docker.com/products/docker-desktop/)
- BunnyCDN account (For media storage) - [Sign Up](https://bunny.net/signup)
- Fly.io account (optional, for deployment) - [Sign Up](https://fly.io/signup)
- yt-dlp (v2024.11.13 or higher) - [Download](https://github.com/yt-dlp/yt-dlp/releases)
- ffmpeg (v6.0.1 or higher) - [Download](https://ffmpeg.org/download.html)

### Navigation

- [:gear: Installation & Set-Up](#-gear-installation--set-up)
- [:cloud: Deploy to Fly.io](#-cloud-deploy-to-flyio)

---

### - :gear: Installation & Set-Up

1. Clone the repository

```bash
git clone https://github.com/rimunace/apis.rocks.git
cd apis.rocks
```

2. Install dependencies

```bash
bun install
```

3. Copy `.env.example` to `.env.local` and configure your environment variables

```bash
cp .env.example .env.local
```

4. Start the server

```bash
bun run dev # Development
bun run start # Production
```

---

### - :cloud: Deploy to Fly.io

> [!NOTE]
> Optional for those who prefer Fly.io

1. Install Fly.io CLI

```bash
curl -L https://fly.io/install.sh | sh
```

2. Login to Fly.io

```bash
fly auth login
```

3. Deploy to Fly.io

```bash
fly deploy
```

---

> [Licensed Under MIT License](LICENSE.md)
