// Import Three.js and relevant loaders
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Custom Saturation Shader
const SaturationShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'saturation': { value: 1.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform float saturation;
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            vec3 result = mix(vec3(gray), color.rgb, saturation);
            gl_FragColor = vec4(result, color.a);
        }
    `
};

// Glitter Sparkle Shader (to create a subtle sparkle effect)
const GlitterSparkleShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'time': { value: 0.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        varying vec2 vUv;

        float random(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            float sparkleIntensity = step(0.98, random(vUv * 50.0 + time * 0.3)) * abs(sin(time * 30.0 + random(vUv) * 6.28));
            color.rgb += sparkleIntensity * 1.5; // Enhance brightness for visible sparkles
            gl_FragColor = vec4(color.rgb, color.a);
        }
    `
};

// Common setup function for scene, camera, and renderer
function setupScene(containerElement) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, containerElement.clientWidth / containerElement.clientHeight, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(containerElement.clientWidth, containerElement.clientHeight);
    renderer.setClearColor(0x000000, 0); // Make background transparent
    renderer.setPixelRatio(window.devicePixelRatio); // Improve rendering quality
    containerElement.appendChild(renderer.domElement);

    // Set up lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 3); // Lower intensity to avoid washing out colors
    scene.add(ambientLight);

    const rectLight = new THREE.RectAreaLight(0xffffff, 4.0, 1, 5); // Increased intensity for more pronounced shine
    rectLight.position.set(0, 2, 0.1); // Position the light extremely close
    rectLight.lookAt(0, 0, 0); // Point towards the model/image
    scene.add(rectLight);

    return { scene, camera, renderer };
}

// Common animation setup function
function setupAnimation(object, composer, scene, camera, rotationAxis = 'z', sparklePass = null) {
    const maxRotation = Math.PI / 9; // 20 degrees in radians
    const animateObject = () => {
        requestAnimationFrame(animateObject);
        const time = Date.now() * 0.001;

        // Apply rotation based on the specified axis
        object.rotation[rotationAxis] = maxRotation * Math.sin(time);

        // Update time uniform for sparkle effect if applicable
        if (sparklePass) {
            sparklePass.uniforms['time'].value = time;
        }

        composer.render();
    };
    animateObject();
}

// Common resize handler
function setupResizeHandler(containerElement, camera, renderer, composer) {
    const handleResize = () => {
        const width = containerElement.clientWidth;
        const height = containerElement.clientHeight;

        if (width > 0 && height > 0) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
            composer.setSize(width, height);
        }
    };
    window.addEventListener('resize', handleResize);

    const resizeCanvasToDisplaySize = () => {
        const canvas = renderer.domElement;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        if (canvas.width !== width || canvas.height !== height) {
            if (width > 0 && height > 0) {
                renderer.setSize(width, height, false);
                composer.setSize(width, height);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
        }
    };

    const animate = () => {
        resizeCanvasToDisplaySize();
        requestAnimationFrame(animate);
        composer.render();
    };
    animate();
}

// Define a function attached to the window object for dynamic loading of a 2D image
window.loadShinyPNG = function (containerElement, imagePath, glitterPath) {
    const { scene, camera, renderer } = setupScene(containerElement);

    // Set up post-processing
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const saturationPass = new ShaderPass(SaturationShader);
    saturationPass.uniforms['saturation'].value = 1; // Increase saturation
    composer.addPass(saturationPass);

    // Load the 2D image texture
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(imagePath, (texture) => {
        // Create a material for the base texture with lighting reactivity
        const baseMaterial = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.5, // Adjust roughness for shininess
            metalness: 0.2, // Adjust metalness to control reflection
            transparent: true, // Enable transparency to respect alpha channel
        });

        // Adjust plane geometry to match the texture's aspect ratio
        const aspectRatio = texture.image.width / texture.image.height;
        const geometry = new THREE.PlaneGeometry(3 * aspectRatio, 3);

        // Create the base plane with the texture
        const basePlane = new THREE.Mesh(geometry, baseMaterial);
        scene.add(basePlane);

        // Set up animation for the base plane
        setupAnimation(basePlane, composer, scene, camera, 'y');

        // Load the glitter texture separately and create a new model
        textureLoader.load(glitterPath, (glitterTexture) => {
            // Create a separate material for the glitter effect
            const glitterMaterial = new THREE.MeshStandardMaterial({
                map: glitterTexture,
                alphaMap: texture, // Use the alpha channel of the base texture to mask the glitter
                transparent: true, // Enable transparency
                blending: THREE.AdditiveBlending,
                // Add emissive color to make glitter pop
                depthWrite: false,
                opacity: 0.5, // Prevent depth writing to ensure the glitter doesn't occlude the base
                roughness: 0.3,
                metalness: 0.5, // Ensure the glitter reacts to lighting
            });

            // Create a separate plane for the glitter overlay
            const glitterPlane = new THREE.Mesh(geometry, glitterMaterial);
            scene.add(glitterPlane);

            // Set initial position of the glitter plane
            glitterPlane.position.set(0, 0, 0.01); // Slight offset to avoid z-fighting

            // Create a sparkle shader pass for the glitter effect
            const sparklePass = new ShaderPass(GlitterSparkleShader);
            sparklePass.uniforms['tDiffuse'].value = glitterTexture;
            composer.addPass(sparklePass);

            // Set up animation for the glitter plane with sparkle effect
            setupAnimation(glitterPlane, composer, scene, camera, 'y', sparklePass);
        }, undefined, (error) => {
            console.error('An error occurred while loading the glitter texture:', error);
        });
    }, undefined, (error) => {
        console.error('An error occurred while loading the image:', error);
    });

    // Position the camera
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    // Handle container resizing
    setupResizeHandler(containerElement, camera, renderer, composer);
};
