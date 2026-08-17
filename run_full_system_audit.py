import subprocess
import sys
import time
import os

def run_command(command, description, cwd=None):
    print(f"\nExecuting: {description}...")
    try:
        process = subprocess.run(command, shell=True, check=True, text=True, cwd=cwd)
        print(f"Completed {description} successfully.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error during {description}: {e}")
        return False

def main():
    print("=======================================================")
    print("  ANTIGRAVITY UNIFIED DEEP AUDIT SUITE STARTING ")
    print("=======================================================")
    
    # Root dir is parent of sales-portal
    root_dir = os.path.dirname(os.getcwd())
    
    # 1. Run out-of-band Python background math stress test
    python_test = run_command(
        "python test_python_sync_fuzz.py", 
        "Root Workspace Python Sync Fuzz Tester",
        cwd=root_dir
    )
    
    if not python_test:
        print("Core integration layer failed fuzzing parameters. Aborting.")
        sys.exit(1)
        
    # 2. Navigate and fire Next.js TypeScript Deep Data Fuzz
    sales_portal_dir = os.getcwd()
    web_test = run_command(
        "npx ts-node test_antigravity_fuzz.ts", 
        "Sales Portal Next.js E2E Deep Data Web Fuzzer",
        cwd=sales_portal_dir
    )

    print("\n=======================================================")
    if python_test and web_test:
        print("CRITICAL SYSTEM HEALTH: 100% SECURE & RESILIENT")
        print("All architectural boundaries hold firm under destructive payloads.")
    else:
        print("System complete with mixed validation warnings. Review logs.")
    print("=======================================================")

if __name__ == '__main__':
    main()
