# Gesture 3D

## Installation Instructions
1. Clone the repository:  
   ```bash  
   git clone https://github.com/udicass/gesture-3d.git  
   cd gesture-3d  
   ```  
2. Ensure you have JDK 11 or higher installed.
3. Build the project with Maven:  
   ```bash  
   mvn clean install  
   ```  

## Troubleshooting Java IOException Errors
If you encounter `IOException` errors while running the project, consider the following:
- Ensure that all necessary libraries are included in your classpath.
- Check file paths for correctness, particularly for resource files.
- Make sure you have the necessary permissions to read/write files.

## Gesture Controls
- **Swipe Left/Right:** Navigate through options.  
- **Pinch In/Out:** Zoom in/out.  
- **Tap:** Select an option.

## Project Structure
- **src/**: Source files of the application.
- **docs/**: Documentation files and resources.
- **lib/**: Library dependencies.
- **tests/**: Test files and scripts.

## Usage Guide
- To start the application, run `java -jar target/gesture-3d.jar`  
- Follow on-screen instructions to interact with the gesture controls.