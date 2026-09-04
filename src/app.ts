import express from 'express';
import helmet from 'helmet';
import { apiRouter } from './routes';
import { errorHandler, notFound } from './middleware/error-handler';
import cors from "cors";

export const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
  })
);
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiRouter);
app.use(notFound);
app.use(errorHandler);
