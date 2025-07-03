const fs = require('fs');
const path = require('path');

class SeferHaChinukhApp {
  constructor() {
    this.baseUrl = 'https://www.sefaria.org/api/texts/';
    this.outputDir = './sefer_hachinukh_data';
    this.delay = 1000; // Increased delay to be more respectful to API
    this.mitzvotData = null;
    this.index = null;
  }

  // ========== DOWNLOAD FUNCTIONS ==========

  ensureDataDirectory() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`📁 Created directory: ${this.outputDir}`);
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async downloadAllMitzvot() {
    console.log('🔄 Starting download of all 613 mitzvot...');
    this.ensureDataDirectory();

    let fetch;
    try {
      // Fixed: Better error handling for dynamic import
      const module = await import('node-fetch');
      fetch = module.default;
    } catch (error) {
      console.error('❌ Error importing node-fetch. Make sure to install: npm install node-fetch');
      console.error('Error details:', error.message);
      return [];
    }

    const allMitzvot = [];
    const failed = [];
    
    for (let i = 1; i <= 613; i++) {
      try {
        const reference = `Sefer_HaChinukh.${i}`;
        const url = `${this.baseUrl}${reference}`;
        
        console.log(`🔄 Downloading Mitzvah ${i}...`);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Fixed: Better validation of response data
        if (!data || (typeof data !== 'object')) {
          throw new Error('Invalid response data format');
        }
        
        // Add mitzvah number to the data
        data.mitzvahNumber = i;
        allMitzvot.push(data);
        
        // Save individual file with better error handling
        try {
          const filename = path.join(this.outputDir, `mitzvah_${i.toString().padStart(3, '0')}.json`);
          fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
        } catch (fileError) {
          console.error(`⚠️  Warning: Could not save individual file for Mitzvah ${i}:`, fileError.message);
        }
        
        console.log(`✓ Downloaded Mitzvah ${i}`);
        
        // Progress indicator
        if (i % 50 === 0) {
          console.log(`📊 Progress: ${i}/613 mitzvot downloaded (${Math.round(i/613*100)}%)`);
        }
        
      } catch (error) {
        console.error(`✗ Error downloading Mitzvah ${i}:`, error.message);
        failed.push({ number: i, error: error.message });
      }
      
      // Respectful delay (increased)
      if (i < 613) {
        await this.sleep(this.delay);
      }
    }
    
    // Save complete collection with error handling
    try {
      const completeFile = path.join(this.outputDir, 'all_mitzvot.json');
      fs.writeFileSync(completeFile, JSON.stringify(allMitzvot, null, 2), 'utf8');
      console.log(`💾 Saved complete collection: ${completeFile}`);
    } catch (error) {
      console.error('❌ Error saving complete collection:', error.message);
    }
    
    // Create search index
    try {
      await this.createSearchIndex(allMitzvot);
    } catch (error) {
      console.error('⚠️  Warning: Could not create search index:', error.message);
    }
    
    console.log(`\n🎉 Download complete!`);
    console.log(`✅ Successfully downloaded: ${allMitzvot.length}/613 mitzvot`);
    console.log(`📂 Data saved in: ${this.outputDir}`);
    
    if (failed.length > 0) {
      console.log(`⚠️  Failed downloads (${failed.length}):`, failed.map(f => f.number).join(', '));
      
      // Save failed list for retry
      const failedFile = path.join(this.outputDir, 'failed_downloads.json');
      fs.writeFileSync(failedFile, JSON.stringify(failed, null, 2), 'utf8');
      console.log(`📋 Failed downloads saved to: ${failedFile}`);
    }
    
    return allMitzvot;
  }

  async createSearchIndex(mitzvotData) {
    if (!Array.isArray(mitzvotData) || mitzvotData.length === 0) {
      console.log('⚠️  No mitzvot data to index');
      return [];
    }

    const index = mitzvotData.map(mitzvah => ({
      number: mitzvah.mitzvahNumber,
      title: mitzvah.indexTitle || mitzvah.title || `Mitzvah ${mitzvah.mitzvahNumber}`,
      heTitle: mitzvah.heTitle || '',
      categories: mitzvah.categories || [],
      // Extract first few words for preview
      preview: this.extractPreview(mitzvah),
      hasHebrew: !!(mitzvah.he && mitzvah.he.length > 0),
      hasEnglish: !!(mitzvah.text && mitzvah.text.length > 0)
    }));
    
    const indexFile = path.join(this.outputDir, 'mitzvot_index.json');
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8');
    
    console.log(`📋 Created search index: ${indexFile}`);
    return index;
  }

  // ========== APP FUNCTIONS ==========

  // Load all data into memory for fast access
  async loadData() {
    try {
      const allMitzvotFile = path.join(this.outputDir, 'all_mitzvot.json');
      const indexFile = path.join(this.outputDir, 'mitzvot_index.json');
      
      if (fs.existsSync(allMitzvotFile)) {
        const rawData = fs.readFileSync(allMitzvotFile, 'utf8');
        this.mitzvotData = JSON.parse(rawData);
        console.log(`📖 Loaded ${this.mitzvotData.length} mitzvot into memory`);
      }
      
      if (fs.existsSync(indexFile)) {
        const rawIndex = fs.readFileSync(indexFile, 'utf8');
        this.index = JSON.parse(rawIndex);
        console.log(`📋 Loaded search index with ${this.index.length} entries`);
      }
      
      if (!this.mitzvotData || !Array.isArray(this.mitzvotData)) {
        console.log('⚠️  No valid data found. Run downloadAllMitzvot() first.');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error loading data:', error.message);
      this.mitzvotData = null;
      this.index = null;
      return false;
    }
  }

  // Get a specific mitzvah by number
  getMitzvah(number) {
    if (!this.mitzvotData || !Array.isArray(this.mitzvotData)) {
      console.log('⚠️  Data not loaded. Run loadData() first.');
      return null;
    }

    // Fixed: Better input validation
    const mitzvahNum = parseInt(number);
    if (isNaN(mitzvahNum) || mitzvahNum < 1 || mitzvahNum > 613) {
      console.log(`❌ Invalid mitzvah number: ${number}. Must be between 1-613.`);
      return null;
    }
    
    const mitzvah = this.mitzvotData.find(m => m.mitzvahNumber === mitzvahNum);
    if (!mitzvah) {
      console.log(`❌ Mitzvah ${mitzvahNum} not found in loaded data`);
      return null;
    }
    
    return mitzvah;
  }

  // Search mitzvot by text content
  searchMitzvot(searchTerm, language = 'both') {
    if (!this.mitzvotData || !Array.isArray(this.mitzvotData)) {
      console.log('⚠️  Data not loaded. Run loadData() first.');
      return [];
    }

    // Fixed: Input validation
    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length === 0) {
      console.log('❌ Invalid search term');
      return [];
    }
    
    const results = [];
    const term = searchTerm.trim().toLowerCase();
    
    this.mitzvotData.forEach(mitzvah => {
      let found = false;
      let matchText = '';
      
      // Search in English text
      if ((language === 'english' || language === 'both') && mitzvah.text) {
        const englishText = Array.isArray(mitzvah.text) ? mitzvah.text.join(' ') : String(mitzvah.text);
        if (englishText.toLowerCase().includes(term)) {
          found = true;
          matchText = this.extractMatchingText(englishText, term);
        }
      }
      
      // Search in Hebrew text
      if ((language === 'hebrew' || language === 'both') && mitzvah.he) {
        const hebrewText = Array.isArray(mitzvah.he) ? mitzvah.he.join(' ') : String(mitzvah.he);
        if (hebrewText.includes(searchTerm)) { // Hebrew search without case conversion
          found = true;
          matchText = this.extractMatchingText(hebrewText, searchTerm);
        }
      }
      
      // Search in titles
      const title = mitzvah.indexTitle || mitzvah.title || '';
      const heTitle = mitzvah.heTitle || '';
      if (String(title).toLowerCase().includes(term) || String(heTitle).includes(searchTerm)) {
        found = true;
        matchText = title || heTitle;
      }
      
      if (found) {
        results.push({
          number: mitzvah.mitzvahNumber,
          title: mitzvah.indexTitle || mitzvah.title || `Mitzvah ${mitzvah.mitzvahNumber}`,
          heTitle: mitzvah.heTitle || '',
          matchText: matchText,
          mitzvah: mitzvah
        });
      }
    });
    
    return results;
  }

  // Get mitzvot by category
  getMitzvotByCategory(category) {
    if (!this.mitzvotData || !Array.isArray(this.mitzvotData)) {
      console.log('⚠️  Data not loaded. Run loadData() first.');
      return [];
    }

    if (!category || typeof category !== 'string') {
      console.log('❌ Invalid category');
      return [];
    }
    
    return this.mitzvotData.filter(mitzvah => 
      mitzvah.categories && Array.isArray(mitzvah.categories) && 
      mitzvah.categories.some(cat => 
        String(cat).toLowerCase().includes(category.toLowerCase())
      )
    );
  }

  // Get random mitzvah
  getRandomMitzvah() {
    if (!this.mitzvotData || !Array.isArray(this.mitzvotData) || this.mitzvotData.length === 0) {
      console.log('⚠️  Data not loaded or empty. Run loadData() first.');
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * this.mitzvotData.length);
    return this.mitzvotData[randomIndex];
  }

  // Display mitzvah in a formatted way
  displayMitzvah(mitzvah, showHebrew = true, showEnglish = true) {
    if (!mitzvah) {
      console.log('❌ No mitzvah provided to display');
      return;
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📜 MITZVAH ${mitzvah.mitzvahNumber || 'Unknown'}`);
    console.log(`${'='.repeat(60)}`);
    
    if (mitzvah.indexTitle || mitzvah.title) {
      console.log(`📖 Title: ${mitzvah.indexTitle || mitzvah.title}`);
    }
    
    if (mitzvah.heTitle && showHebrew) {
      console.log(`📖 Hebrew Title: ${mitzvah.heTitle}`);
    }
    
    if (mitzvah.categories && Array.isArray(mitzvah.categories) && mitzvah.categories.length > 0) {
      console.log(`🏷️  Categories: ${mitzvah.categories.join(', ')}`);
    }
    
    console.log(`${'─'.repeat(60)}`);
    
    if (showEnglish && mitzvah.text) {
      console.log(`📝 English Text:`);
      const englishText = Array.isArray(mitzvah.text) ? mitzvah.text.join('\n') : String(mitzvah.text);
      console.log(englishText);
      console.log();
    }
    
    if (showHebrew && mitzvah.he) {
      console.log(`📝 Hebrew Text:`);
      const hebrewText = Array.isArray(mitzvah.he) ? mitzvah.he.join('\n') : String(mitzvah.he);
      console.log(hebrewText);
      console.log();
    }
    
    console.log(`${'='.repeat(60)}\n`);
  }

  // ========== UTILITY FUNCTIONS ==========

  extractPreview(mitzvah, maxLength = 100) {
    if (!mitzvah) return '';
    
    let text = '';
    if (mitzvah.text) {
      text = Array.isArray(mitzvah.text) ? mitzvah.text.join(' ') : String(mitzvah.text);
    } else if (mitzvah.he) {
      text = Array.isArray(mitzvah.he) ? mitzvah.he.join(' ') : String(mitzvah.he);
    }
    
    // Fixed: Better handling of empty text
    text = text.trim();
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  extractMatchingText(text, searchTerm, contextLength = 100) {
    if (!text || !searchTerm) return '';
    
    const textStr = String(text);
    const termStr = String(searchTerm);
    const index = textStr.toLowerCase().indexOf(termStr.toLowerCase());
    
    if (index === -1) return textStr.substring(0, contextLength) + '...';
    
    const start = Math.max(0, index - Math.floor(contextLength / 2));
    const end = Math.min(textStr.length, index + termStr.length + Math.floor(contextLength / 2));
    
    return (start > 0 ? '...' : '') + textStr.substring(start, end) + (end < textStr.length ? '...' : '');
  }

  // Get statistics about the mitzvot collection
  getStats() {
    if (!this.mitzvotData || !Array.isArray(this.mitzvotData)) {
      console.log('⚠️  Data not loaded. Run loadData() first.');
      return null;
    }
    
    const stats = {
      total: this.mitzvotData.length,
      withEnglish: this.mitzvotData.filter(m => m.text && (Array.isArray(m.text) ? m.text.length > 0 : String(m.text).trim().length > 0)).length,
      withHebrew: this.mitzvotData.filter(m => m.he && (Array.isArray(m.he) ? m.he.length > 0 : String(m.he).trim().length > 0)).length,
      categories: [...new Set(this.mitzvotData.flatMap(m => m.categories || []))],
      averageTextLength: 0
    };
    
    const totalLength = this.mitzvotData.reduce((sum, m) => {
      const text = Array.isArray(m.text) ? m.text.join('') : String(m.text || '');
      return sum + text.length;
    }, 0);
    
    stats.averageTextLength = stats.total > 0 ? Math.round(totalLength / stats.total) : 0;
    
    console.log('\n📊 SEFER HACHINUKH STATISTICS');
    console.log('═'.repeat(40));
    console.log(`📚 Total Mitzvot: ${stats.total}`);
    console.log(`🇺🇸 With English: ${stats.withEnglish}`);
    console.log(`🇮🇱 With Hebrew: ${stats.withHebrew}`);
    console.log(`📝 Average Text Length: ${stats.averageTextLength} characters`);
    console.log(`🏷️  Categories: ${stats.categories.length}`);
    console.log('═'.repeat(40));
    
    return stats;
  }

  // Export mitzvah to different formats
  exportMitzvah(mitzvahNumber, format = 'json') {
    const mitzvah = this.getMitzvah(mitzvahNumber);
    if (!mitzvah) return null;
    
    const filename = `mitzvah_${mitzvahNumber}_export`;
    
    try {
      switch (format.toLowerCase()) {
        case 'json':
          fs.writeFileSync(`${filename}.json`, JSON.stringify(mitzvah, null, 2), 'utf8');
          break;
        case 'txt':
          const textContent = this.formatMitzvahAsText(mitzvah);
          fs.writeFileSync(`${filename}.txt`, textContent, 'utf8');
          break;
        case 'md':
          const markdownContent = this.formatMitzvahAsMarkdown(mitzvah);
          fs.writeFileSync(`${filename}.md`, markdownContent, 'utf8');
          break;
        default:
          console.log('❌ Unsupported format. Use: json, txt, or md');
          return null;
      }
      
      console.log(`✅ Exported Mitzvah ${mitzvahNumber} as ${filename}.${format}`);
      return `${filename}.${format}`;
    } catch (error) {
      console.error(`❌ Error exporting Mitzvah ${mitzvahNumber}:`, error.message);
      return null;
    }
  }

  formatMitzvahAsText(mitzvah) {
    if (!mitzvah) return '';
    
    let content = `MITZVAH ${mitzvah.mitzvahNumber || 'Unknown'}\n`;
    content += '='.repeat(50) + '\n\n';
    
    if (mitzvah.indexTitle) content += `Title: ${mitzvah.indexTitle}\n`;
    if (mitzvah.heTitle) content += `Hebrew Title: ${mitzvah.heTitle}\n`;
    if (mitzvah.categories && Array.isArray(mitzvah.categories)) {
      content += `Categories: ${mitzvah.categories.join(', ')}\n`;
    }
    
    content += '\n' + '-'.repeat(50) + '\n\n';
    
    if (mitzvah.text) {
      content += 'English Text:\n';
      const text = Array.isArray(mitzvah.text) ? mitzvah.text.join('\n') : String(mitzvah.text);
      content += text + '\n\n';
    }
    
    if (mitzvah.he) {
      content += 'Hebrew Text:\n';
      const heText = Array.isArray(mitzvah.he) ? mitzvah.he.join('\n') : String(mitzvah.he);
      content += heText + '\n\n';
    }
    
    return content;
  }

  formatMitzvahAsMarkdown(mitzvah) {
    if (!mitzvah) return '';
    
    let content = `# Mitzvah ${mitzvah.mitzvahNumber || 'Unknown'}\n\n`;
    
    if (mitzvah.indexTitle) content += `**Title:** ${mitzvah.indexTitle}\n\n`;
    if (mitzvah.heTitle) content += `**Hebrew Title:** ${mitzvah.heTitle}\n\n`;
    if (mitzvah.categories && Array.isArray(mitzvah.categories)) {
      content += `**Categories:** ${mitzvah.categories.join(', ')}\n\n`;
    }
    
    content += '---\n\n';
    
    if (mitzvah.text) {
      content += '## English Text\n\n';
      const text = Array.isArray(mitzvah.text) ? mitzvah.text.join('\n\n') : String(mitzvah.text);
      content += text + '\n\n';
    }
    
    if (mitzvah.he) {
      content += '## Hebrew Text\n\n';
      const heText = Array.isArray(mitzvah.he) ? mitzvah.he.join('\n\n') : String(mitzvah.he);
      content += heText + '\n\n';
    }
    
    return content;
  }

  // Fixed: Added retry functionality for failed downloads
  async retryFailedDownloads() {
    const failedFile = path.join(this.outputDir, 'failed_downloads.json');
    
    if (!fs.existsSync(failedFile)) {
      console.log('ℹ️  No failed downloads file found');
      return [];
    }

    let failedList;
    try {
      const rawData = fs.readFileSync(failedFile, 'utf8');
      failedList = JSON.parse(rawData);
    } catch (error) {
      console.error('❌ Error reading failed downloads file:', error.message);
      return [];
    }

    if (!Array.isArray(failedList) || failedList.length === 0) {
      console.log('ℹ️  No failed downloads to retry');
      return [];
    }

    console.log(`🔄 Retrying ${failedList.length} failed downloads...`);
    
    let fetch;
    try {
      const module = await import('node-fetch');
      fetch = module.default;
    } catch (error) {
      console.error('❌ Error importing node-fetch:', error.message);
      return [];
    }

    const successful = [];
    const stillFailed = [];

    for (const failed of failedList) {
      const mitzvahNum = failed.number;
      try {
        const reference = `Sefer_HaChinukh.${mitzvahNum}`;
        const url = `${this.baseUrl}${reference}`;
        
        console.log(`🔄 Retrying Mitzvah ${mitzvahNum}...`);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        data.mitzvahNumber = mitzvahNum;
        
        const filename = path.join(this.outputDir, `mitzvah_${mitzvahNum.toString().padStart(3, '0')}.json`);
        fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
        
        successful.push(data);
        console.log(`✓ Successfully retried Mitzvah ${mitzvahNum}`);
        
        await this.sleep(this.delay);
        
      } catch (error) {
        console.error(`✗ Still failed Mitzvah ${mitzvahNum}:`, error.message);
        stillFailed.push({ number: mitzvahNum, error: error.message });
      }
    }

    // Update the failed downloads file
    if (stillFailed.length > 0) {
      fs.writeFileSync(failedFile, JSON.stringify(stillFailed, null, 2), 'utf8');
    } else {
      fs.unlinkSync(failedFile); // Remove file if no more failures
    }

    console.log(`\n🎉 Retry complete!`);
    console.log(`✅ Successfully retried: ${successful.length} mitzvot`);
    console.log(`❌ Still failed: ${stillFailed.length} mitzvot`);

    return successful;
  }
}

// ========== EXAMPLE USAGE AND DEMO ==========

async function demoApp() {
  console.log('🚀 SEFER HACHINUKH APP DEMO');
  console.log('═'.repeat(50));
  
  const app = new SeferHaChinukhApp();
  
  // Check if data exists, if not download it
  const dataExists = await app.loadData();
  
  if (!dataExists) {
    console.log('📥 No data found. Downloading all 613 mitzvot...');
    console.log('⏳ This will take about 15-20 minutes with respectful delays...');
    await app.downloadAllMitzvot();
    await app.loadData(); // Reload after download
  }
  
  // Show statistics
  app.getStats();
  
  // Demo: Get a specific mitzvah
  console.log('\n🎭 DEMO: Getting Mitzvah #1');
  const mitzvah1 = app.getMitzvah(1);
  if (mitzvah1) {
    app.displayMitzvah(mitzvah1);
  }
  
  // Demo: Search functionality
  console.log('\n🔍 DEMO: Searching for "Shabbat"');
  const shabbatResults = app.searchMitzvot('Shabbat');
  console.log(`Found ${shabbatResults.length} results:`);
  shabbatResults.slice(0, 3).forEach((result, index) => {
    console.log(`${index + 1}. Mitzvah ${result.number}: ${result.title}`);
    console.log(`   Preview: ${result.matchText}\n`);
  });
  
  // Demo: Random mitzvah
  console.log('\n🎲 DEMO: Random Mitzvah');
  const randomMitzvah = app.getRandomMitzvah();
  if (randomMitzvah) {
    console.log(`Random selection: Mitzvah ${randomMitzvah.mitzvahNumber}`);
    console.log(`Title: ${randomMitzvah.indexTitle || randomMitzvah.title}`);
  }
  
  // Demo: Export functionality
  console.log('\n💾 DEMO: Exporting Mitzvah 1 as Markdown');
  app.exportMitzvah(1, 'md');
  
  console.log('\n✨ Demo complete! You can now use all the app functions.');
}

// ========== MAIN EXECUTION ==========

// Create app instance
const seferHaChinukhApp = new SeferHaChinukhApp();

// Export for use in other files
module.exports = SeferHaChinukhApp;

// If running this file directly, run the demo
if (require.main === module) {
  demoApp().catch(console.error);
}

// ========== QUICK START GUIDE ==========
/*
QUICK START GUIDE:
==================

1. SETUP:
   npm install node-fetch

2. RUN THE APP:
   node this-file-name.js

3. USE THE APP FUNCTIONS:
   
   const app = new SeferHaChinukhApp();
   await app.loadData();
   
   // Get specific mitzvah
   const mitzvah = app.getMitzvah(100);
   app.displayMitzvah(mitzvah);
   
   // Search
   const results = app.searchMitzvot('prayer');
   
   // Random mitzvah
   const random = app.getRandomMitzvah();
   
   // Export
   app.exportMitzvah(50, 'md');
   
   // Statistics
   app.getStats();
   
   // Retry failed downloads
   await app.retryFailedDownloads();

4. AVAILABLE FUNCTIONS:
   - downloadAllMitzvot(): Download all 613 mitzvot
   - loadData(): Load data into memory
   - getMitzvah(number): Get specific mitzvah
   - searchMitzvot(term, language): Search mitzvot
   - getMitzvotByCategory(category): Filter by category
   - getRandomMitzvah(): Get random mitzvah
   - displayMitzvah(mitzvah): Pretty print mitzvah
   - exportMitzvah(number, format): Export to file
   - getStats(): Show collection statistics
   - retryFailedDownloads(): Retry previously failed downloads
*/