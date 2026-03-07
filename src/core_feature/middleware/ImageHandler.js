
import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const uploadMiddleware = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
     contentDisposition: "inline", 
    key: (req, file, cb) => {
      const fileName = `uploads/${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
      cb(null, fileName);
    },
  }),
  fileFilter: (req, file, cb) => {
    // only allow images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});



export const SingleuploadMiddleware = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    contentDisposition: "inline", // 👈 ensures browser views instead of downloading
    key: (req, file, cb) => {
      const fileName = `uploads/${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
      cb(null, fileName);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 5 MB
}).single("image"); 