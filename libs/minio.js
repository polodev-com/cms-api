import fs from "fs";
import * as Minio from "minio";

// Initialize the MinIO client
const {MINIO_AK, MINIO_SK, MINIO_PORT, MINIO_SSL_ENABLED, MINIO_ENDPOINT} =
    process.env;
const minioClient = new Minio.Client({
    endPoint: MINIO_ENDPOINT,
    // port: Number(MINIO_PORT) || 9000,
    useSSL: MINIO_SSL_ENABLED === "true" ? true : false, // Set to true if using HTTPS
    accessKey: MINIO_AK,
    secretKey: MINIO_SK,
    region: "us-east-1",
});

export async function checkBucketConnection(bucketName) {
    try {
        const exists = await minioClient.bucketExists(bucketName);
        if (exists) {
            console.log(`Connected to MinIO bucket: ${bucketName}`);
        } else {
            throw new Error(`Can't connect to MinIO bucket ${bucketName}`);
        }
    } catch (error) {
        console.log("[Tim debug] checkBucketConnection error", error);

    }
}

// async function putOBject(bucketName, fileKey, filePath) {
//   try {
//     // Check if the bucket exists, if not, create it
//     const bucketExists = await minioClient.bucketExists(bucketName);

//     // Upload the file
//     const fileStream = fs.createReadStream(filePath);
//     const fileStat = fs.statSync(filePath);

//     await minioClient.putObject(
//       bucketName,
//       fileKey,
//       fileStream,
//     );
//       fileStat.size,
//     console.log(
//       `File "${fileKey}" uploaded successfully to bucket "${bucketName}".`,
//     );
//   } catch (err) {
//     console.error("Error uploading file:", err);
//   }
// }

/**
 * @description Generate presigned url for uploading files directly to OBS bucket
 * @param {string} bucketName
 * @param {string} fileKey
 * @param {number} expiry Expire time in seconds, default is 5 minutes (300 seconds)
 */
export async function generatePresignedUrl(
    bucketName,
    fileKey,
    expiry = Number(process.env.MINIO_PRESIGNED_UPLOAD_URL_EXPIRE_TIME),
) {
    return await minioClient.presignedPutObject(
        bucketName,
        fileKey,
        expiry,
        (err, presignedUrl) => {
            if (err) {
                throw err;
            }
            return presignedUrl;
        },
    );
}

// Function to get an object from a MinIO bucket
async function getObject(bucketName, fileKey, downloadPath) {
    try {
        // Get the object and save it locally
        const objectStream = await minioClient.getObject(bucketName, fileKey);
        const fileStream = fs.createWriteStream(downloadPath);

        objectStream.pipe(fileStream);

        fileStream.on("finish", () => {
            console.log(
                `Object "${fileKey}" downloaded successfully to "${downloadPath}".`,
            );
        });

        fileStream.on("error", (err) => {
            console.error("Error writing to file:", err);
        });
    } catch (err) {
        console.error("Error getting object:", err);
    }
}

// Function to upload an object to a MinIO bucket
export async function uploadObject(bucketName, fileKey, filePath) {
    try {
        // Check if the bucket exists
        const bucketExists = await minioClient.bucketExists(bucketName);
        if (!bucketExists) {
            throw new Error(`Bucket ${bucketName} does not exist.`);
        }
        // Read the file as a stream
        const fileStream = fs.createReadStream(filePath);
        const fileStat = fs.statSync(filePath);
        // Upload the file
        await minioClient.putObject(bucketName, fileKey, fileStream, fileStat.size);
        console.log(`File "${fileKey}" uploaded successfully to bucket "${bucketName}".`);
    } catch (err) {
        console.error("Error uploading file:", err);
    }
}

// Function to upload all files in a folder to MinIO under a specific path
export async function uploadFolderToMinio(bucketName, localFolderPath, minioBasePath = "") {
    const path = await import('path');
    const walkSync = (dir, filelist = []) => {
        fs.readdirSync(dir).forEach(file => {
            const filepath = path.default.join(dir, file);
            if (fs.statSync(filepath).isDirectory()) {
                walkSync(filepath, filelist);
            } else {
                filelist.push(filepath);
            }
        });
        return filelist;
    };
    const files = walkSync(localFolderPath);
    for (const filePath of files) {
        // Get the relative path from the local folder
        const relativePath = path.default.relative(localFolderPath, filePath);
        // Construct the destination path in MinIO
        const minioPath = minioBasePath ? path.default.join(minioBasePath, relativePath) : relativePath;
        // Use forward slashes for MinIO paths
        const minioKey = minioPath.split(path.default.sep).join("/");
        await uploadObject(bucketName, minioKey, filePath);
    }
}
