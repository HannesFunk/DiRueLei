// python_loader.js - Python Module Loader for Pyodide

class PythonModuleLoader {
    constructor(pyodide) {
        this.pyodide = pyodide;
        this.loadedModules = new Map();
    }

    async loadModuleFromFile(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${filePath}: ${response.status}`);
            }
            const pythonCode = await response.text();
            return pythonCode;
        } catch (error) {
            console.error(`Error loading Python module from ${filePath}:`, error);
            throw error;
        }
    }

    async loadAndExecuteModule(moduleName, filePath) {
        try {
            console.log(`Loading Python module: ${moduleName} from ${filePath}`);
            
            // Load the Python code from file
            const pythonCode = await this.loadModuleFromFile(filePath);
            
            // Execute the Python code in Pyodide
            this.pyodide.runPython(pythonCode);
            
            // Store reference that module is loaded
            this.loadedModules.set(moduleName, filePath);
            
            console.log(`Successfully loaded Python module: ${moduleName}`);
            return true;
            
        } catch (error) {
            console.error(`Failed to load Python module ${moduleName}:`, error);
            throw error;
        }
    }

    async loadAllModules(moduleConfig) {
        const loadPromises = moduleConfig.map(async ({ name, path }) => {
            try {
                await this.loadAndExecuteModule(name, path);
                return { name, success: true };
            } catch (error) {
                console.error(`Failed to load module ${name}:`, error);
                return { name, success: false, error };
            }
        });

        const results = await Promise.all(loadPromises);
        
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        
        console.log(`Loaded ${successful.length}/${results.length} Python modules successfully`);
        
        if (failed.length > 0) {
            console.warn('Failed to load modules:', failed.map(f => f.name));
        }
        
        return {
            successful: successful.map(s => s.name),
            failed: failed.map(f => ({ name: f.name, error: f.error })),
            total: results.length
        };
    }

    getLoadedModules() {
        return Array.from(this.loadedModules.keys());
    }

    isModuleLoaded(moduleName) {
        return this.loadedModules.has(moduleName);
    }

    getModulePath(moduleName) {
        return this.loadedModules.get(moduleName);
    }
}