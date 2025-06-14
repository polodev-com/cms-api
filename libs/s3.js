import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command
} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner"; // For presigned URLs
import {Upload} from "@aws-sdk/lib-storage"; // For managed uploads

// Configure the AWS Region and S3 client
const {AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey, AWS_REGION, BUCKET_NAME} = process.env
if ([accessKeyId, secretAccessKey, AWS_REGION, BUCKET_NAME].some(config => !config)) {
    throw new Error("S3 configurations missing")
}
const s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
        accessKeyId,
        secretAccessKey
    }
});


export async function checkS3Connection() {
    try {
        const command = new ListObjectsV2Command({Bucket: BUCKET_NAME, MaxKeys: 1});
        await s3Client.send(command)
        return true
    } catch (error) {
        console.error("[checkS3Connection] error:", error);
        return false
    }
}