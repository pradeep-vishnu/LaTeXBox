const { test, expect } = require('@playwright/test');

test.describe('LaTeX Sandbox Edge Cases', () => {
  
  // Before each test, load the page
  test.beforeEach(async ({ page }) => {
    // Assuming the file is served locally during CI, e.g., via a simple http-server
    await page.goto('http://localhost:8080/index.html');
    
    // Wait for the initial auto-render to complete
    await page.waitForSelector('#status-text', { state: 'visible' });
    await expect(page.locator('#status-text')).toHaveText('Render successful');
  });

  test('Scenario 1: Clears label cache on consecutive runs', async ({ page }) => {
    // Input an equation with a label
    await page.evaluate(() => {
      document.querySelector('.CodeMirror').CodeMirror.setValue('\\begin{equation} x = y \\label{eq:1} \\end{equation}');
    });

    // Run first time
    await page.click('#run-btn');
    await expect(page.locator('#status-text')).toHaveText('Render successful');

    // Run second time (this would fail if MathJax.texReset() is missing)
    await page.click('#run-btn');
    await expect(page.locator('#error-panel')).not.toBeVisible();
    await expect(page.locator('#status-text')).toHaveText('Render successful');
  });

  test('Scenario 2: Prevents XSS Injection', async ({ page }) => {
    const maliciousPayload = '<script>window.xssTriggered = true;</script>';
    
    await page.evaluate((payload) => {
      document.querySelector('.CodeMirror').CodeMirror.setValue(payload);
    }, maliciousPayload);

    await page.click('#run-btn');
    
    // Verify the script did not execute
    const isHacked = await page.evaluate(() => window.xssTriggered === true);
    expect(isHacked).toBe(false);

    // Verify HTML brackets were escaped in the DOM
    const previewHtml = await page.innerHTML('#preview-content');
    expect(previewHtml).toContain('&lt;script&gt;');
  });

  test('Scenario 3: Graceful failure on malformed LaTeX', async ({ page }) => {
    // Input equation missing a closing brace
    await page.evaluate(() => {
      document.querySelector('.CodeMirror').CodeMirror.setValue('\\begin{equation} \\frac{1}{2 \\end{equation}');
    });

    await page.click('#run-btn');

    // Verify error UI is displayed
    await expect(page.locator('#error-panel')).toBeVisible();
    await expect(page.locator('#status-dot')).toHaveClass(/error/);
    
    // Verify our custom suggestion logic kicks in
    const suggestionText = await page.locator('#error-suggestion').innerText();
    expect(suggestionText).toContain('Suggested fix:');
  });

  test('Scenario 4: Successfully parses \\cite commands', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelector('.CodeMirror').CodeMirror.setValue('According to \\cite{Turing1936}, this is computable.');
    });

    await page.click('#run-btn');

    // Check if the custom span was generated
    const citeSpan = page.locator('.latex-cite');
    await expect(citeSpan).toBeVisible();
    await expect(citeSpan).toHaveText('[Cite: Turing1936]');
  });

  test('Scenario 5: Handles empty input safely', async ({ page }) => {
    // Click clear button
    await page.click('button:has-text("Clear")');
    
    // Run empty string
    await page.click('#run-btn');

    // Expect successful render with empty preview pane
    await expect(page.locator('#status-text')).toHaveText('Render successful');
    const innerHtml = await page.innerHTML('#preview-content');
    // It might contain empty <p></p> due to preprocessing, which is fine
    expect(innerHtml.replace(/\s+/g, '')).toMatch(/^(<p><\/p>)?$/);
  });

  test('Scenario 6: Global Keyboard Shortcut execution', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelector('.CodeMirror').CodeMirror.setValue('E = mc^2');
    });

    // Simulate Control + Enter on the body
    await page.keyboard.press('Control+Enter');

    // Wait for update animation class to be applied to the preview container
    await expect(page.locator('#preview-content')).toHaveClass(/anim-update/);
    await expect(page.locator('#status-text')).toHaveText('Render successful');
  });
});
