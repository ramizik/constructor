import "dotenv/config";
import { Daytona } from "@daytona/sdk";

if (!process.env.DAYTONA_API_KEY) {
  throw new Error("DAYTONA_API_KEY not set in backend/.env");
}

export const daytona = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
});
