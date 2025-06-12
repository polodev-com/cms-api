'use strict';

/** @type {import('sequelize-').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        /**
         * Add altering commands here.
         *
         * Example:
         * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
         */
        // Add content_storage column to articles table
        await queryInterface.addColumn('articles', 'content_storage', {
            type: Sequelize.JSONB,
            defaultValue: {}
        });
    },

    async down(queryInterface, Sequelize) {
        /**
         * Add reverting commands here.
         *
         * Example:
         * await queryInterface.dropTable('users');
         */
        // Remove content_storage column from articles table
        await queryInterface.removeColumn('articles', 'content_storage');
    }
};
