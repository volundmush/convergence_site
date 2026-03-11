import React from 'react';
import { component, fields } from '@keystone-6/fields-document/component-blocks';

export const componentBlocks = {
	image: component({
		preview: (props) => {
			const imageUrl = props.fields.image.value?.data?.image?.url;
			const float = props.fields.float.value;
			
			if (!imageUrl) {
				return (
					<div contentEditable={false} style={{ 
						padding: '1rem', 
						border: '2px dashed #ccc', 
						borderRadius: '4px',
						textAlign: 'center',
						color: '#666'
					}}>
						Select an image
					</div>
				);
			}
			
			const containerStyle: React.CSSProperties = float === 'none'
				? {
					margin: '1rem 0',
					textAlign: 'center',
				}
				: {
					float: float as any,
					margin: float === 'left' ? '0 1rem 1rem 0' : '0 0 1rem 1rem',
					maxWidth: '300px',
				};
			
			return (
				<div contentEditable={false} style={containerStyle}>
					<img
						src={imageUrl}
						alt={props.fields.alt.value || 'Image'}
						style={{
							maxWidth: '100%',
							height: 'auto',
							display: 'block',
							borderRadius: '4px',
						}}
					/>
					{props.fields.caption.value && (
						<p style={{
							margin: '0.5rem 0 0 0',
							fontSize: '0.875rem',
							color: '#666',
							fontStyle: 'italic',
						}}>
							{props.fields.caption.value}
						</p>
					)}
				</div>
			);
		},
		label: 'Image',
		schema: {
			image: fields.relationship({
				listKey: 'Image',
				label: 'Image',
				labelField: 'name',
				selection: 'id name image { url }',
				many: false,
			}),
			alt: fields.text({
				label: 'Alt text',
				defaultValue: '',
			}),
			caption: fields.text({
				label: 'Caption',
				defaultValue: '',
			}),
			float: fields.select({
				label: 'Layout',
				options: [
					{ label: 'Full width (breaking)', value: 'none' },
					{ label: 'Float left', value: 'left' },
					{ label: 'Float right', value: 'right' },
				],
				defaultValue: 'none',
			}),
		},
	}),
};
