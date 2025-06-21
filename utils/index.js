import {CMS_MINIO_PUBLIC_BUCKET_NAME, MINIO_ENDPOINT, NODE_ENV} from "../consts/index.js";

export const makeResponse = (responseBody = null, success, message = "") => {
    return {
        success,
        data: responseBody,
        message:
            !message && success
                ? "Success"
                : !message && !message
                    ? "Failed"
                    : message,
    };
};

export const getAuthorInfo = () => {
    return {
        name: "Polodev",
        avatarUrl: `https://${MINIO_ENDPOINT}/${CMS_MINIO_PUBLIC_BUCKET_NAME}/images/polodev-logo.jpg`,
    }
}

export const getThumbnailUrl = (articleId) => {
    return `https://${MINIO_ENDPOINT}/${CMS_MINIO_PUBLIC_BUCKET_NAME}/${NODE_ENV}/articles/${articleId}/thumbnail.png`
}

export const getArticleContentUrl = (articleId) => {
    return `https://${MINIO_ENDPOINT}/${CMS_MINIO_PUBLIC_BUCKET_NAME}/${NODE_ENV}/articles/${articleId}/content.md`
}