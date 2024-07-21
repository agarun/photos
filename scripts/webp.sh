#!/bin/bash

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

install_cwebp() {
    echo "Setting up cwebp..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        sudo apt-get update
        sudo apt-get install -y webp
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            brew install webp
        else
            echo "Homebrew is not installed. Please install Homebrew first."
            exit 1
        fi
    elif [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "win"* ]]; then
        # Windows
        wget https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.4.0-windows-x64.zip -O webp.zip
        unzip webp.zip
        mv libwebp-1.4.0-windows-x64/bin/cwebp.exe .
        rm -rf libwebp-1.4.0-windows-x64 webp.zip
        echo "cwebp.exe has been downloaded and extracted to the current directory."
    else
        echo "Unsupported operating system. Please install cwebp manually."
        exit 1
    fi
}

if ! command_exists cwebp; then
    install_cwebp
fi

if [ $# -eq 0 ]; then
    echo "Please provide an input directory."
    exit 1
fi

input_dir="$1"
output_dir="${input_dir}_webp"
mkdir -p "$output_dir"

get_image_dimensions() {
    if command_exists identify; then
        identify -format "%w %h" "$1" | awk '{print $1, $2}'
    else
        echo "0 0"  # Fallback if ImageMagick is not installed
    fi
}

find "$input_dir" \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | while read -r img; do
    current_path="${img#$input_dir/}"
    output_path="$output_dir/${current_path%.*}.webp"
    mkdir -p "$(dirname "$output_path")"
    
    read width height < <(get_image_dimensions "$img")
    max_dimension=$((width > height ? width : height))

    target_size=$((400 * 1024))

    if [ $width -gt 2048 ] || [ $height -gt 2048 ]; then
        if [ $width -ge $height ]; then
            resize_param="-resize 2048 0"
        else
            resize_param="-resize 0 2048"
        fi
    else
        resize_param=""
    fi
    
    cwebp -q 90 -m 5 -mt $resize_param -size $target_size "$img" -o "$output_path"
    
    echo "Converted $img -> $output_path"
done

echo "Finished. Saved in $output_dir"