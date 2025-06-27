import "dotenv/config";
import express from "express";

const app = express();
const port = process.env.PORT || 3000;
import sequelize from "./libs/database.js";
import cors from "cors";
import "./crons/index.js";
import {checkMinIOBucketConnection} from "./libs/minio.js";
import {rateLimit} from "express-rate-limit";

app.use(express.json()); // for parsing application/json

const corsWhiteListOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",") || [];
const corsOptions = {
    origin: function (origin, callback) {
        if (corsWhiteListOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    }
}
app.use(cors(corsOptions));

// Rate limiter configuration
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minutes
    limit: process.env.ALLOWED_REQUESTS_PER_MINUTE || 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: "draft-8", // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    // store: ... , // Redis, Memcached, etc. See below.
});
app.use(limiter);

// Sync the models to database
sequelize
    .sync({force: false}) // Set `force: true` to drop and recreate tables
    .then(() => {
        console.log("Database & tables created!");
    })
    .catch((err) => console.error("Unable to create tables:", err));
import articleRoute from "./routes/articles.route.js";
import {checkS3Connection} from "./libs/s3.js";
import {updateArticleCountByKeyword} from "./crons/index.js";

// Use routes
app.use("/articles", articleRoute);

app.get("/health-check", (req, res) => {
    res.status(200).json({
        status: "success",
        message: "Service is up and running",
        timestamp: new Date().toISOString(),
    });
});

app.listen(port, async () => {
    console.log(`Example app listening on port ${port}`);
    // Checking connection to other services
    const {
        CMS_MINIO_PUBLIC_BUCKET_NAME: publicMinIOBucket,
        CMS_MINIO_PRIVATE_BUCKET_NAME: privateMinIOBucket,
        SUPPORTED_OBJECT_STORAGE_SERVICES
    } = process.env;
    const supportedServices = SUPPORTED_OBJECT_STORAGE_SERVICES?.split(",") || [];
    if (supportedServices.includes("minio")) {
        await checkMinIOBucketConnection(publicMinIOBucket);
        await checkMinIOBucketConnection(privateMinIOBucket);
    }
    if (supportedServices) {
        await checkS3Connection().then(ok => ok && console.log("Connected to S3"));
    }

    // Init the article count by keyword cache in case the cron job is not yet run
    await updateArticleCountByKeyword()
});
