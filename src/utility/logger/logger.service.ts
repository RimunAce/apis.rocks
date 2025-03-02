import winston from "winston";
const { combine, timestamp, printf, colorize, align } = winston.format;

const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  align(),
  printf((info: winston.Logform.TransformableInfo) => {
    const { timestamp, level, message, ...args } = info;
    const ts = timestamp?.toString().slice(0, 19).replace("T", " ");
    return `${ts} [${level}]: ${message} ${
      Object.keys(args).length ? JSON.stringify(args, null, 2) : ""
    }`;
  })
);

const fileFormat = combine(timestamp(), winston.format.json());

const logger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: fileFormat,
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      format: fileFormat,
    }),
  ],
});

export default logger;
