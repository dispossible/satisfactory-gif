import readline from "node:readline";

/**
 * @param {String} query
 * @return {Promise<String>}
 */
export async function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

/**
 * @param {String} query
 * @return {Promise<Boolean>}
 */
export async function askYesNoQuestion(query) {
    const answer = await askQuestion(query);
    if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
        return true;
    } else if (answer.toLowerCase() === "n" || answer.toLowerCase() === "no") {
        return false;
    }
    console.log("Invalid input, please enter 'y' or 'n'");
    return askYesNoQuestion(query);
}
