import {DataTypes} from "sequelize";
import sequelize from "../libs/database.js";

const Article = sequelize.define(
    "Article",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM,
            values: ["hidden", "published", "delisted"],
            allowNull: false,
            defaultValue: "hidden",
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true, // Set to false if description is required
        },
        keywords: {
            type: DataTypes.JSONB,
            defaultValue: [],
            allowNull: false, // Set to false if keywords are required
        },
        content_storage: {
            type: DataTypes.JSONB,
            defaultValue: {},
            allowNull: false, // Set to false if storage_prefix is required
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updated_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        publish_on: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        publish_to: {
            type: DataTypes.DATE,
            defaultValue: null,
            allowNull: true, // If this null, the article will always be published
        },
    },
    {
        tableName: "articles",
        timestamps: false, // Set to true if you want Sequelize to manage createdAt and updatedAt fields
    },
);

export default Article;
