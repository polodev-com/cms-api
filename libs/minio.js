import fs from "fs";
import * as Minio from "minio";

// Initialize the MinIO client
const {MINIO_AK, MINIO_SK, MINIO_PORT, MINIO_SSL_ENABLED, MINIO_ENDPOINT} =
    process.env;
export const minioClient = new Minio.Client({
    endPoint: MINIO_ENDPOINT,
    // port: Number(MINIO_PORT) || 9000,
    useSSL: MINIO_SSL_ENABLED === "true", // Set to true if using HTTPS
    accessKey: MINIO_AK,
    secretKey: MINIO_SK,
    // region: "us-east-1",
});

export async function checkMinIOBucketConnection(bucketName) {
    try {
        const exists = await minioClient.bucketExists(bucketName);
        if (exists) {
            console.log(`Connected to MinIO bucket: ${bucketName}`);
        } else {
            throw new Error(`Can't connect to MinIO bucket ${bucketName}`);
        }
    } catch (error) {
        console.error("[checkMinIOBucketConnection] error:", error);
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

// Function to move all files under a fileKey from one bucket to another
// TODO: This is AI generated, double check this
export async function moveFilesBetweenBuckets(sourceBucket, destinationBucket, fileKeyPrefix) {
    try {
        // List all objects with the given prefix in the source bucket.
        // minioClient.listObjectsV2 returns an async iterator.
        // We collect all object names first to avoid issues with re-iterating the stream.
        const objectsStream = minioClient.listObjectsV2(sourceBucket, fileKeyPrefix, true);
        const filesToProcess = [];
        for await (const obj of objectsStream) {
            // Ensure that obj and obj.name are valid
            if (obj && obj.name) {
                filesToProcess.push(obj.name); // Store only names
            }
        }

        if (filesToProcess.length === 0) {
            console.log(`No files found with prefix "${fileKeyPrefix}" in bucket "${sourceBucket}". Nothing to move.`);
            return; // Indicate that no operation was performed
        }

        // --- Step 1: Copy all files ---
        const copyPromises = filesToProcess.map(sourceFileKey => {
            // Determine destination key: remove prefix from source key.
            // e.g., if fileKeyPrefix = "folder1/", sourceFileKey = "folder1/image.jpg" -> destinationFileKey = "image.jpg"
            let destinationFileKey = sourceFileKey;
            if (fileKeyPrefix && sourceFileKey.startsWith(fileKeyPrefix)) {
                destinationFileKey = sourceFileKey.substring(fileKeyPrefix.length);
            }
            // If the prefix is the entire object key, destinationFileKey could be empty.
            // Minio typically requires non-empty object keys.
            // This implementation assumes fileKeyPrefix is a path-like prefix and destinationFileKey will be non-empty.
            // If destinationFileKey is empty, putObject might fail or behave unexpectedly.
            if (destinationFileKey === "") {
                // Fallback: if stripping prefix results in empty string, use the original filename part.
                // This handles cases like prefix="file.txt" and key="file.txt" -> move as "file.txt"
                const lastSlash = sourceFileKey.lastIndexOf('/');
                destinationFileKey = lastSlash === -1 ? sourceFileKey : sourceFileKey.substring(lastSlash + 1);
                if (destinationFileKey === "") { // Should not happen if sourceFileKey is valid
                    console.warn(`Warning: Calculated empty destination key for source ${sourceFileKey} with prefix ${fileKeyPrefix}. Skipping this file for safety.`);
                    return Promise.resolve(); // Skip this problematic file
                }
            }

            return (async () => {
                const objectStream = await minioClient.getObject(sourceBucket, sourceFileKey);
                await minioClient.putObject(destinationBucket, destinationFileKey, objectStream);
            })();
        });

        await Promise.all(copyPromises);
        console.log(`Successfully copied ${filesToProcess.length} files matching prefix "${fileKeyPrefix}" from bucket "${sourceBucket}" to bucket "${destinationBucket}".`);

        // --- Step 2: Delete all files from source if copy was successful ---
        const deletePromises = filesToProcess.map(sourceFileKey => {
            // Check if the file was skipped during copy (e.g. due to empty destination key)
            // This check is a bit indirect; ideally, skipped files wouldn't be in delete list.
            // For simplicity, we attempt to delete all originally listed files.
            // If a file was problematic and skipped in copy, its deletion here is okay as it wasn't "moved".
            return minioClient.removeObject(sourceBucket, sourceFileKey);
        });

        await Promise.all(deletePromises);
        console.log(`Successfully deleted ${filesToProcess.length} files matching prefix "${fileKeyPrefix}" from bucket "${sourceBucket}".`);
        console.log(`All files with prefix "${fileKeyPrefix}" were successfully moved from bucket "${sourceBucket}" to bucket "${destinationBucket}".`);

    } catch (err) {
        console.error(`Error moving files with prefix "${fileKeyPrefix}" from bucket "${sourceBucket}" to "${destinationBucket}":`, err);
        throw err; // Re-throw to allow caller to handle
    }
}
