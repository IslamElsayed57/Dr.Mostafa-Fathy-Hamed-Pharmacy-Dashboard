// ==========================================================================
// صيدلية د.مصطفى فتحي حامد (Dr.Mostafa Fathy Hamed Pharmacy) - Supabase Service Layer
// ==========================================================================

class SupabaseService {
    constructor() {
        if (!window.supabase) {
            console.error("Supabase JS CDN library not loaded!");
            return;
        }

        this.client = window.supabase.createClient(
            CONFIG.SUPABASE_URL,
            CONFIG.SUPABASE_PUBLISHABLE_KEY
        );
    }

    getClient() {
        return this.client;
    }

    /**
     * Creates a secure temporary Signed URL for viewing private prescription files
     * @param {string} filePath - The path or public URL of the prescription file
     * @param {number} expiresIn - Expiration in seconds (default 3600 = 1 hour)
     */
    async getPrescriptionSignedUrl(filePath, expiresIn = 3600) {
        if (!filePath) return null;

        try {
            // Extract the filename if a full URL was stored
            let cleanPath = filePath;
            if (filePath.includes("/prescriptions/")) {
                cleanPath = filePath.split("/prescriptions/").pop();
            }

            const { data, error } = await this.client
                .storage
                .from(CONFIG.STORAGE_BUCKETS.PRESCRIPTIONS)
                .createSignedUrl(cleanPath, expiresIn);

            if (error) {
                console.error("Could not create signed URL for private prescription:", error);
                return null;
            }

            return data?.signedUrl || null;
        } catch (err) {
            console.error("Prescription Signed URL Error:", err);
            return null;
        }
    }

    /**
     * Uploads an image file to product-images storage bucket
     * @param {File} file 
     * @returns {Promise<string|null>} Public URL of uploaded image
     */
    async uploadProductImage(file) {
        if (!file) return null;

        try {
            const ext = file.name.split(".").pop();
            const safeName = `product_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;

            const { error: uploadError } = await this.client
                .storage
                .from(CONFIG.STORAGE_BUCKETS.PRODUCT_IMAGES)
                .upload(safeName, file, { cacheControl: "3600", upsert: true });

            if (uploadError) {
                console.error("Product image upload error:", uploadError);
                return null;
            }

            const { data } = this.client
                .storage
                .from(CONFIG.STORAGE_BUCKETS.PRODUCT_IMAGES)
                .getPublicUrl(safeName);

            return data?.publicUrl || null;
        } catch (err) {
            console.error("Unexpected image upload error:", err);
            return null;
        }
    }

    /**
     * Permanently deletes an image file from product-images storage bucket
     * @param {string} imageUrlOrPath - The public URL or file path of the product image
     * @returns {Promise<boolean>}
     */
    async deleteProductImage(imageUrlOrPath) {
        if (!imageUrlOrPath) return false;

        try {
            const bucket = CONFIG.STORAGE_BUCKETS.PRODUCT_IMAGES;
            let filePath = imageUrlOrPath;

            // Extract file path inside bucket if a full URL was passed
            const marker = `/${bucket}/`;
            if (filePath.includes(marker)) {
                filePath = filePath.split(marker).pop();
            } else if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
                filePath = filePath.split("/").pop();
            }

            // Remove any query params or URL encoding
            filePath = filePath.split("?")[0];
            filePath = decodeURIComponent(filePath);

            if (!filePath) return false;

            const { error } = await this.client
                .storage
                .from(bucket)
                .remove([filePath]);

            if (error) {
                console.error("Supabase storage image remove error:", error);
                return false;
            }

            return true;
        } catch (err) {
            console.error("Unexpected product image delete error:", err);
            return false;
        }
    }
}

// Global Singleton
const db = new SupabaseService();
