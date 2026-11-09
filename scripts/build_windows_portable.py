"""Compatibility entry point for the versioned portable builder."""
import sys
from build_portable import main
if __name__ == '__main__':
    main(['--target', 'windows-x64', *sys.argv[1:]])
