import {createRequire} from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
import {jest} from '@jest/globals';

const {CMS_MINIO_PUBLIC_BUCKET_NAME: sourceBucket, CMS_MINIO_PRIVATE_BUCKET_NAME: destinationBucket} = process.env;
// Mock setup
const mockClient = {
    listObjectsV2: jest.fn(),
    getObject: jest.fn(),
    putObject: jest.fn(),
    removeObject: jest.fn(),
    bucketExists: jest.fn(),
    removeObjects: jest.fn(),
};

jest.mock('./minio.js', () => ({
    minioClient: mockClient,
    moveFilesBetweenBuckets: jest.requireActual('./minio.js').moveFilesBetweenBuckets,
    uploadObject: jest.requireActual('./minio.js').uploadObject
}));

import {moveFilesBetweenBuckets, uploadObject} from './minio.js';

describe('MinIO operations', () => {
    // Test file paths
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minio-test-'));
    const testFiles = [
        path.join(testDir, 'file1.txt'),
        path.join(testDir, 'file2.txt')
    ];
    const testPrefix = 'prefix/';

    // Create test files
    beforeAll(() => {
        // Create test files
        fs.writeFileSync(testFiles[0], 'test content 1');
        fs.writeFileSync(testFiles[1], 'test content 2');

        // Mock bucketExists to return true
        mockClient.bucketExists.mockResolvedValue(true);
        // Mock putObject for uploadObject function
        mockClient.putObject.mockResolvedValue();
    });

    // Clean up test files
    afterAll(() => {
        // Remove test directory and files
        testFiles.forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
        if (fs.existsSync(testDir)) {
            fs.rmdirSync(testDir);
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('uploadObject', () => {
        test('should upload files to the bucket successfully', async () => {
            // Upload the test files
            await uploadObject(sourceBucket, `${testPrefix}file1.txt`, testFiles[0]);
            await uploadObject(sourceBucket, `${testPrefix}file2.txt`, testFiles[1]);

            // Verify bucketExists was called
            expect(mockClient.bucketExists).toHaveBeenCalledWith(sourceBucket);
            // Verify putObject was called twice (once for each file)
            expect(mockClient.putObject).toHaveBeenCalledTimes(2);
        });
    });

    describe('moveFilesBetweenBuckets', () => {
        test('should move files with the given prefix between buckets successfully', async () => {
            mockClient.listObjectsV2.mockReturnValue([
                {name: `${testPrefix}file1.txt`},
                {name: `${testPrefix}file2.txt`},
            ][Symbol.iterator]());

            mockClient.getObject.mockResolvedValue('file-content');
            mockClient.putObject.mockResolvedValue();
            mockClient.removeObject.mockResolvedValue();

            await moveFilesBetweenBuckets(sourceBucket, destinationBucket, testPrefix);

            expect(mockClient.listObjectsV2).toHaveBeenCalledWith(sourceBucket, testPrefix, true);
            expect(mockClient.getObject).toHaveBeenCalledTimes(2);
            expect(mockClient.putObject).toHaveBeenCalledTimes(2);
            expect(mockClient.removeObject).toHaveBeenCalledTimes(2);

            expect(mockClient.putObject).toHaveBeenCalledWith(
                destinationBucket,
                'file1.txt',
                'file-content'
            );
            expect(mockClient.putObject).toHaveBeenCalledWith(
                destinationBucket,
                'file2.txt',
                'file-content'
            );
            expect(mockClient.removeObject).toHaveBeenCalledWith(
                sourceBucket,
                `${testPrefix}file1.txt`
            );
            expect(mockClient.removeObject).toHaveBeenCalledWith(
                sourceBucket,
                `${testPrefix}file2.txt`
            );
        });

        test('should handle case where no files match the prefix', async () => {
            mockClient.listObjectsV2.mockReturnValue([][Symbol.iterator]());

            const fileKeyPrefix = 'non-matching-prefix/';

            await moveFilesBetweenBuckets(sourceBucket, destinationBucket, fileKeyPrefix);

            expect(mockClient.listObjectsV2).toHaveBeenCalledWith(sourceBucket, fileKeyPrefix, true);
            expect(mockClient.getObject).not.toHaveBeenCalled();
            expect(mockClient.putObject).not.toHaveBeenCalled();
            expect(mockClient.removeObject).not.toHaveBeenCalled();
        });

        test('should handle errors during file operations', async () => {
            mockClient.listObjectsV2.mockReturnValue([
                {name: `${testPrefix}file1.txt`},
            ][Symbol.iterator]());

            mockClient.getObject.mockRejectedValue(new Error('getObject error'));

            await expect(
                moveFilesBetweenBuckets(sourceBucket, destinationBucket, testPrefix)
            ).rejects.toThrow('getObject error');

            expect(mockClient.listObjectsV2).toHaveBeenCalledWith(sourceBucket, testPrefix, true);
            expect(mockClient.getObject).toHaveBeenCalledTimes(1);
            expect(mockClient.putObject).not.toHaveBeenCalled();
            expect(mockClient.removeObject).not.toHaveBeenCalled();
        });
    });

    describe('deleteObjects', () => {
        test('should delete objects from the bucket', async () => {
            // Setup mock for removeObjects
            mockClient.removeObjects.mockResolvedValue();

            // List of objects to delete
            const objectsToDelete = [
                `${testPrefix}file1.txt`,
                `${testPrefix}file2.txt`
            ];

            // Call removeObjects
            await mockClient.removeObjects(sourceBucket, objectsToDelete);

            // Verify removeObjects was called with the correct parameters
            expect(mockClient.removeObjects).toHaveBeenCalledWith(
                sourceBucket,
                objectsToDelete
            );
            expect(mockClient.removeObjects).toHaveBeenCalledTimes(1);
        });
    });
});