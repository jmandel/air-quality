import { findPreviousScript } from "./ask-history-lookup";

const question = "What is the current CO₂ level?";
console.log("Testing question:", question);

const result = await findPreviousScript(question);
if (result) {
  console.log("Found previous script:");
  console.log("- ID:", result.previousId);
  console.log("- Script length:", result.scriptContent.length);
} else {
  console.log("No previous script found");
}
