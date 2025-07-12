import Articles from "../models/articles.model.js";
import {generatePresignedUrl, moveFilesBetweenBuckets} from "../libs/minio.js";
import {allowedFileExtensions, NODE_ENV} from "../consts/index.js";
import pick from "lodash";
import {
    articleUpdateSchema,
    getArticleListSchema,
    getArticleStatSchema,
} from "./articlesValidationSchema.js";
import {
    articleListCache,
    getHashedQuery,
    articleCountByKeywordCache,
    articleDetailCache,
} from "../libs/cache.js";
import {Op} from "sequelize";
import path from "path";
import moment from "moment";
import {getArticleContentUrl, getAuthorInfo, getThumbnailUrl, makeResponse} from "../utils/index.js";
import {validateUserJWTToken, validateUserJWTTokenMiddleware} from "../middlewares/auth.js";
import {updateArticleCountByKeyword} from "../crons/index.js";

const articlesController = {
    getArticleList: async (req, res, next) => {
        try {
            // Only for admin, must have the JWT token in the header
            // Admins allowed to list all articles regardless of status or publish date
            let isAdmin = false;
            let adminInfo;
            if (req.headers.authorization) {
                try {
                    adminInfo = await validateUserJWTToken(req, res)
                    if (adminInfo.valid && adminInfo.user.role === "admin") {
                        isAdmin = true
                    }
                } catch (e) {
                    return res.status(401).json({message: "Unauthorized"})
                }
            }

            let queryParam;
            try {
                queryParam = await getArticleListSchema.validate(req.query, {
                    abortEarly: true,
                    stripUnknown: true,
                    context: {isAdmin: isAdmin}
                });
            } catch (error) {
                return res
                    .status(400)
                    .json({message: "Bad request", error: error.message});
            }
            // Check if the article list in the cache
            const [articleListCacheQuery, hashError] = getHashedQuery(queryParam);
            if (hashError) {
                return res
                    .status(500)
                    .json({message: "Something went wrong", error: hashError});
            }
            if (!hashError && articleListCacheQuery && !isAdmin) {
                const cachedArticleList = articleListCache.get(articleListCacheQuery);
                if (cachedArticleList) {
                    return res.status(200).json(cachedArticleList);
                }
            }
            const {
                page,
                pageSize,
                keywords,
                sortby = "created_at",
                sorttype = "DESC",
            } = queryParam;
            const limit = parseInt(pageSize); // Number of records per page
            const offset = (parseInt(page) - 1) * limit; // Calculate offset
            const now = moment().toDate();
            let whereClauses = !adminInfo ? {
                [Op.and]: [
                    {
                        publish_on: {
                            [Op.lte]: now,
                        },
                    },
                    {
                        [Op.or]: [{publish_to: {[Op.gte]: now}}, {publish_to: null}],
                    },
                ],
                status: "published",
            } : {[Op.and]: []};

            const filterByKeywords = !!keywords?.length;
            if (filterByKeywords) {
                whereClauses[Op.and].push({
                    keywords: {[Op.contains]: keywords.split(",")},
                });
            }
            const {count, rows} = await Articles.findAndCountAll({
                limit,
                offset,
                raw: true,
                order: [[sortby, sorttype]],
                where: whereClauses,
            });
            const response = {
                totalArticles: count,
                totalPages: Math.ceil(count / limit),
                currentPage: parseInt(page),
                data: rows.map((article) => {
                    return {
                        ...article,
                        author: getAuthorInfo(), // TODO: Make this more flexible
                        content: getArticleContentUrl(article.id),
                        thumbnail: getThumbnailUrl(article.id)
                    };
                }),
            };
            // When not admin, cache the article query
            if (!isAdmin) {
                articleListCache.set(articleListCacheQuery, response);
            }
            res.status(200).json(response);
        } catch (error) {
            console.error("Error in getArticleList", error);
            res.status(500).json({message: "Something went wrong"});
        }
    },
    getArticleById: async (req, res) => {
        try {
            let isAdmin = false;
            let adminInfo;

            if (req.headers.authorization) {
                try {
                    adminInfo = await validateUserJWTToken(req, res)
                    if (adminInfo.valid && adminInfo.user.role === "admin") {
                        isAdmin = true
                    }
                } catch (e) {
                    return res.status(401).json({message: "Unauthorized"})
                }
            }
            const {articleId} = req.params;
            if (!articleId) {
                return res.status(400).json({message: "Missing article id param"});
            }
            const cachedInfo = articleDetailCache.get(articleId);
            if (cachedInfo) {
                return res.status(200).json(cachedInfo);
            }
            // Check if the articleInfo available in the cache
            await Articles.findByPk(articleId)
                .then((article) => {
                    if (!article || (article.dataValues.status !== "published" && !isAdmin)) {
                        return res.status(404).json({message: "Article not found or has been set to private"});
                    }
                    const response = {
                        ...pick(article.dataValues, [
                            "id",
                            "title",
                            "keywords",
                            "created_at",
                            "updated_at",
                        ]).__wrapped__,
                        // This is the default main content that served from minio
                        // TODO: Make this more flexible
                        author: getAuthorInfo(),
                        content: getArticleContentUrl(articleId),
                        thumbnail: getThumbnailUrl(articleId),
                    };
                    if (!isAdmin) {
                        articleDetailCache.set(articleId, response);
                    }
                    return res.status(200).json(response);
                })
                .catch((e) => {
                    throw e;
                });
        } catch (error) {
            console.error("Error in getArticleById", error?.stack);
            res.status(500).json({message: "Something went wrong"});
        }
    },
    createArticle: async (req, res) => {
        try {
            const {title, description, keywords} = req.body;
            const newArticle = await Articles.create({
                title,
                description,
                keywords,
            });
            return res.status(200).json(newArticle);
        } catch (error) {
            console.error("Error in createArticle", error?.stack);
            return res.status(500).json({message: "Something went wrong"});
        }
    },

    /**
     * // TODO: Support uploading files to S3
     * Request presigned url for uploading article content to minIO or S3
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    uploadArticleContent: async (req, res) => {
        try {
            const {CMS_MINIO_PUBLIC_BUCKET_NAME: cmsDataBucketName} = process.env;
            const {articleId} = req.params;
            // User can upload multiple files
            const {files} = req.body;
            let response = {};
            // Validate files extension
            files.forEach((fileName) => {
                const fileExtension = path.extname(fileName);
                if (!allowedFileExtensions.includes(fileExtension)) {
                    return res.status(400).json({
                        message: `File type: ${fileExtension} is not allowed for upload`,
                    });
                }
            });
            let promises = [];
            for (const fileName of files) {
                const fileKey = `${articleId}/${fileName}`;
                promises.push(
                    generatePresignedUrl(cmsDataBucketName, fileKey).then(
                        (presignedUrl) => {
                            response[fileName] = presignedUrl;
                        },
                    ),
                );
            }
            await Promise.all(promises);
            return res.status(200).json({data: response});

            // With each files, generate a presigned url for it
        } catch (error) {
            console.error("Error in uploadArticleContent", error?.stack);
            res.status(500).json({message: "Something went wrong"});
        }
    },
    getArticleStatistics: async (req, res) => {
        try {
            let queries;
            try {
                queries = await getArticleStatSchema.validate(req.query);
            } catch (error) {
                return res.status(400).json({message: "Bad request"});
            }
            const keywords = queries.keywords.split(",");
            const response = makeResponse(
                articleCountByKeywordCache.mget(keywords),
                true,
            );
            res.status(200).json(response);
        } catch (error) {
            console.error("Error in getArticleStatistics", error?.stack);
            res.status(500).json(makeResponse(null, false, "Something went wrong"));
        }
    },
    updateArticleById: async (req, res) => {
        try {
            let body;
            const {articleId} = req.params;
            const {
                CMS_MINIO_PUBLIC_BUCKET_NAME: publicBucketName,
                CMS_MINIO_PRIVATE_BUCKET_NAME: privateBucketName
            } = process.env;

            if (!publicBucketName || !privateBucketName) {
                throw new Error('MinIO bucket names not configured in environment variables');
            }

            try {
                if (!articleId) {
                    throw Error("Missing article id");
                }
                body = await articleUpdateSchema.validate(req.body);
            } catch (error) {
                console.error(error);
                return res.status(400).json({message: "Bad request"});
            }

            // Find the article with id
            const article = await Articles.findByPk(articleId);
            if (!article) {
                return res.status(404).json({message: "Article not found"});
            }

            // Check if status is being changed from published to hidden/delisted
            if (article.status === 'published' &&
                (body.status === 'hidden' || body.status === 'delisted')) {
                try {
                    const prefix = `${NODE_ENV}/articles/${articleId}/`;
                    // Move files from public to private bucket
                    await moveFilesBetweenBuckets(
                        publicBucketName,
                        privateBucketName,
                        prefix
                    );
                    // Clear the cache for the article by id
                    articleDetailCache.del(articleId)
                    articleListCache.flushAll()
                } catch (error) {
                    console.error("[updateArticleById] error:", error);
                    return res.status(500).json({
                        message: "Failed to move article files to private storage"
                    });
                }
            }
            // If status changed from "hidden" or "delisted" to "published"
            // Then move all the files from the private bucket to the public bucket
            if (body.status === 'published' && (["hidden", "delisted"].includes(article.status))) {
                try {
                    const prefix = `${NODE_ENV}/articles/${articleId}/`;
                    await moveFilesBetweenBuckets(privateBucketName, publicBucketName, prefix);
                } catch (e) {
                    console.error("[updateArticleById] error:", e);
                }
            }

            // Update the article metadata
            const response = await Articles.update(
                {...body, updated_at: Date.now()},
                {
                    where: {id: articleId},
                    returning: true,
                }
            );

            return res.status(200).json({
                data: pick(response[1][0].dataValues, [
                    "id",
                    "title",
                    "description",
                    "keywords",
                    "created_at",
                    "updated_at",
                ]),
            });
        } catch (error) {
            console.error("Error in updateArticleById", error);
            res.status(500).json({message: "Something went wrong"});
        }
    },
    deleteArticle: async (req, res, next) => {
        try {
            const {articleId} = req.params;
            const article = await Articles.findByPk(articleId);
            if (!article) {
                return res.status(404).json({message: "Article not found"});
            }
            await Articles.destroy({where: {id: articleId}});
            // TODO: Remove also the file on object storage
        } catch (error) {
            console.error("Error in deleteArticle", error?.stack);
            res.status(500).json({message: "Something went wrong"});
        }
    },
    clearArticleCache: async (req, res) => {
        try {
            const {
                articleId,
                flushAllArticleListCache = false,
                flushAllArticleDetailCache = false,
                refreshKeywordStats = false
            } = req.body;
            if (articleId) {
                articleDetailCache.del(articleId);
            }
            if (flushAllArticleListCache) {
                articleListCache.flushAll();
            }
            if (flushAllArticleDetailCache) {
                articleDetailCache.flushAll();
            }
            if (refreshKeywordStats) {
                await updateArticleCountByKeyword()
            }
            return res.status(200).json({message: "Article cache cleared successfully"});
        } catch (error) {
            console.error("Error in clearArticleCache", error?.stack);
            res.status(500).json({message: "Something went wrong"});
        }
    }
};

export default articlesController;