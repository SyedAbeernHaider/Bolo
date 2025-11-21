// VectorStore.js
import { collection, getDocs } from 'firebase/firestore';
import { db, COLLECTION_NAME } from '../firebase'; 

/**
 * A client-side vector store for finding the nearest neighbors
 * of sign language vectors using Cosine Similarity.
 */
class VectorStore {
    constructor() {
        this.vectors = [];
        this.dimensions = 0;
        this.isInitialized = false;
    }

    /**
     * Fetches all vectors from Firebase Firestore and loads them into the store.
     * @returns {Promise<number>} A promise that resolves to the number of vectors loaded.
     */
    async loadFromFirebase() {
        if (this.isInitialized) {
            // console.log("VectorStore is already initialized."); // Removed for cleaner console
            return this.vectors.length;
        }
        try {
            console.log(`Fetching vectors from Firestore collection: ${COLLECTION_NAME}...`);
            const vectorsCollection = collection(db, COLLECTION_NAME);
            const snapshot = await getDocs(vectorsCollection);
            
            const signData = snapshot.docs.map(doc => {
                const data = doc.data();
                // Ensure keypoints is an array of numbers (Firestore might store it as an array)
                const keypoints = Array.isArray(data.keypoints) ? data.keypoints : [];
                return {
                    label: data.label,
                    keypoints: keypoints, // The 1D fixed-length vector
                };
            }).filter(d => d.keypoints.length > 0); // Only keep valid vectors

            if (signData.length > 0) {
                this.vectors = signData;
                // All vectors MUST have the same fixed length
                this.dimensions = this.vectors[0].keypoints.length;
                this.isInitialized = true;
                console.log(`VectorStore initialized with ${this.vectors.length} vectors, each of ${this.dimensions} dimensions.`);
            } else {
                 console.warn("No vectors found in Firestore.");
            }
            
            return signData.length;

        } catch (error) {
            console.error("Error loading vectors from Firebase:", error);
            this.vectors = [];
            this.dimensions = 0;
            this.isInitialized = false;
            return 0;
        }
    }

    /**
     * Calculates the Cosine Similarity between two vectors.
     * @param {number[]} v1
     * @param {number[]} v2
     * @returns {number} Similarity score between 0 and 1.
     */
    _cosineSimilarity(v1, v2) {
        let dotProduct = 0;
        let magnitude1 = 0;
        let magnitude2 = 0;

        for (let i = 0; i < v1.length; i++) {
            dotProduct += v1[i] * v2[i];
            magnitude1 += v1[i] ** 2;
            magnitude2 += v2[i] ** 2;
        }

        magnitude1 = Math.sqrt(magnitude1);
        magnitude2 = Math.sqrt(magnitude2);

        if (magnitude1 === 0 || magnitude2 === 0) {
            return 0; // Avoid division by zero
        }
        
        return dotProduct / (magnitude1 * magnitude2);
    }

    /**
     * Finds the best match for a query vector using Cosine Similarity.
     * @param {number[]} queryVector - The flattened array of the live sign (fixed length).
     * @returns {Object|null} The best match { label, similarity } or null if no vectors are loaded.
     */
    findBestMatch(queryVector) {
        if (!this.isInitialized || this.vectors.length === 0) {
            console.error("VectorStore is not initialized or is empty.");
            return null;
        }

        if (queryVector.length !== this.dimensions) {
            console.error(`Query vector size (${queryVector.length}) does not match stored vector size (${this.dimensions}). Expected ${this.dimensions}.`);
            return null;
        }

        let bestMatch = { label: null, similarity: -1 };

        for (const storedSign of this.vectors) {
            const similarity = this._cosineSimilarity(queryVector, storedSign.keypoints);
            if (similarity > bestMatch.similarity) {
                bestMatch = { label: storedSign.label, similarity: similarity };
            }
        }

        return bestMatch.similarity > 0 ? bestMatch : null;
    }
    
    /**
     * Groups vectors by sign and calculates the averaged vector for each sign.
     * Then finds the best match against these averaged vectors. (Not strictly needed
     * for the initial implementation but keeps the prompt's idea).
     * @param {number[]} queryVector - The flattened array of the live sign (fixed length).
     * @returns {Object|null} The best match { label, similarity } or null.
     */
    findBestMatchAveraged(queryVector) {
        if (!this.isInitialized || this.vectors.length === 0) return null;
        
        // 1. Group vectors by sign (e.g., "RIGHT A")
        const groupedVectors = this.vectors.reduce((acc, curr) => {
            const signKey = curr.label.split(' ').slice(0, 2).join(' '); // e.g., "RIGHT A"
            if (!acc[signKey]) acc[signKey] = [];
            acc[signKey].push(curr.keypoints);
            return acc;
        }, {});

        let bestMatch = { label: null, similarity: -1 };

        // 2. Compute average vector and compare
        for (const signKey in groupedVectors) {
            const vectors = groupedVectors[signKey];
            const numVectors = vectors.length;
            const avgVector = new Array(this.dimensions).fill(0);

            // Sum all vectors
            vectors.forEach(v => {
                for (let i = 0; i < this.dimensions; i++) {
                    avgVector[i] += v[i];
                }
            });

            // Divide by the number of vectors to get the average
            for (let i = 0; i < this.dimensions; i++) {
                avgVector[i] /= numVectors;
            }
            
            // Compare query against average vector
            const similarity = this._cosineSimilarity(queryVector, avgVector);
            
            if (similarity > bestMatch.similarity) {
                bestMatch = { label: signKey, similarity: similarity };
            }
        }

        return bestMatch.similarity > 0 ? bestMatch : null;
    }
}

// Export a single instance (Singleton pattern)
export const SignVectorStore = new VectorStore();